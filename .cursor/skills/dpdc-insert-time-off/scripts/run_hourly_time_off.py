"""
Scan ShowDateFile for late starts and optionally submit TimeLeave hourly requests.

Usage:
  python run_hourly_time_off.py --month "شهریور 1405" --dry-run
  python run_hourly_time_off.py --from 1405/05/25 --to 1405/06/24 --dry-run
  python run_hourly_time_off.py --date 1405/06/18 --dry-run --screenshot-dir shots
  python run_hourly_time_off.py self-check

Gate (hard): queue only entry > 07:45. Entry at/before 07:45 → empty queue (correct).
No --force: on-time days must never get TimeLeave.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from duration import (  # noqa: E402
    BASELINE,
    NOTE,
    LateDay,
    classify_modal_fail,
    decide_row,
    filter_month_dates,
    in_date_range,
    is_red_color,
    months_spanning,
    norm_date,
    norm_fa,
    parse_day_cell,
    parse_month_label,
    self_check as duration_self_check,
    time_to_mask_digits,
)

BASE = "http://10.10.16.102:8092"
LOGIN = f"{BASE}/Login.aspx"
SHOW = f"{BASE}/Employee/ShowDateFile.aspx"
LEAVE = f"{BASE}/Employee/TimeLeave.aspx"

USER = os.environ.get("ATTENDANCE_USER", "")
PASS = os.environ.get("ATTENDANCE_PASS", "")

XP = {
    "month_prev": "#ctl00_ContentPlaceHolder1_BtnPreviousMonth",
    "month_next": "#ctl00_ContentPlaceHolder1_BtnNextMonth",
    "month_label": "#ctl00_ContentPlaceHolder1_lblMonth",
    "grid": "#ctl00_ContentPlaceHolder1_GrdShowDataFile tr",
    "grid_rows_fallback": (
        "/html/body/form/div[3]/div/div[2]/div/table/tbody/tr[2]/td/div/table/tbody/tr"
    ),
    "hourly_radio": (
        "/html/body/form/div[3]/div/div[2]/div/table/tbody/tr/td/table"
        "/tbody/tr/td/table/tbody/tr[1]/td[1]/input[1]"
    ),
    "leave_date": "#ctl00_ContentPlaceHolder1_TimeLeave1_EditRequestDate_AnotherDate2",
    "leave_start": "#ctl00_ContentPlaceHolder1_TimeLeave1_EditStartTime",
    "leave_duration": "#ctl00_ContentPlaceHolder1_TimeLeave1_EditDuration",
    "leave_note": "#ctl00_ContentPlaceHolder1_TimeLeave1_Edit_Description",
    "leave_ok": "#ctl00_ContentPlaceHolder1_TimeLeave1_BtnOK",
}


def _configure_stdio() -> None:
    """Windows cp1252 consoles break Persian JSON; force UTF-8 replace."""
    for stream in (sys.stdout, sys.stderr):
        reconf = getattr(stream, "reconfigure", None)
        if callable(reconf):
            try:
                reconf(encoding="utf-8", errors="replace")
            except Exception:
                pass


def emit_result(data: dict, out_path: Path | None) -> None:
    """Write -o first, then print — print must not block artifact persistence."""
    text = json.dumps(data, ensure_ascii=False, indent=2)
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(text + "\n", encoding="utf-8")
    try:
        print(text)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((text + "\n").encode("utf-8", errors="replace"))


class Shotter:
    def __init__(self, page, out_dir: Path | None) -> None:
        self.page = page
        self.out_dir = out_dir
        self.n = 0
        if out_dir:
            out_dir.mkdir(parents=True, exist_ok=True)

    def snap(self, label: str) -> str | None:
        if not self.out_dir:
            return None
        self.n += 1
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:80]
        path = self.out_dir / f"{self.n:02d}-{safe}.png"
        self.page.screenshot(path=str(path), full_page=True)
        return str(path)


def _fill_by_label(page, label: str, value: str) -> None:
    loc = page.get_by_label(label, exact=False)
    if loc.count():
        loc.first.fill(value)
        return
    inp = page.locator(
        f"xpath=//td[contains(normalize-space(.), '{label}')]/following::input[1]"
    )
    if inp.count():
        inp.first.fill(value)
        return
    raise RuntimeError(f"cannot find input for label {label!r}")


def login(page, shots: Shotter) -> None:
    page.goto(LOGIN, wait_until="domcontentloaded")
    shots.snap("login-page")
    _fill_by_label(page, "نام کاربر", USER)
    shots.snap("login-user-filled")
    _fill_by_label(page, "رمز عبور", PASS)
    shots.snap("login-pass-filled")
    btn = page.get_by_role("button", name="ورود")
    if btn.count():
        btn.first.click()
    else:
        page.locator("xpath=//input[@value='ورود' or contains(@value,'ورود')]").first.click()
    page.wait_for_load_state("domcontentloaded")
    shots.snap("after-login")


def month_label_text(page) -> str:
    loc = page.locator(XP["month_label"])
    if loc.count():
        return norm_fa(loc.first.inner_text())
    root = page.locator("xpath=/html/body/form/div[3]/div/div[2]/div/table/tbody/tr[1]")
    return norm_fa(root.inner_text() if root.count() else page.inner_text("body"))


def _click_month(page, which: str) -> None:
    """ASP.NET image button updates DOM without a full navigation event."""
    label = page.locator(XP["month_label"])
    before = " ".join(label.first.inner_text().split())
    page.locator(XP[which]).first.click(position={"x": 5, "y": 5})
    page.wait_for_function(
        """(prev) => {
          const el = document.querySelector('#ctl00_ContentPlaceHolder1_lblMonth');
          const t = ((el && el.textContent) || '').replace(/\\s+/g, ' ').trim();
          return t !== prev;
        }""",
        arg=before,
        timeout=15000,
    )


def _month_label_matches(current: str, target: str) -> bool:
    """Match month+year tokens; avoid substring false friends across years."""
    cur_p = parse_month_label(current)
    tgt_p = parse_month_label(target)
    if cur_p and tgt_p:
        return cur_p == tgt_p
    return norm_fa(target) in norm_fa(current)


def select_month(page, target: str, shots: Shotter, max_clicks: int = 24) -> None:
    target_n = norm_fa(target)
    cur = ""
    for i in range(max_clicks):
        cur = month_label_text(page)
        shots.snap(f"month-prev-{i}-{cur[:40]}")
        if _month_label_matches(cur, target_n):
            return
        _click_month(page, "month_prev")
    for i in range(max_clicks):
        cur = month_label_text(page)
        shots.snap(f"month-next-{i}-{cur[:40]}")
        if _month_label_matches(cur, target_n):
            return
        _click_month(page, "month_next")
    raise RuntimeError(f"month {target!r} not found (last={cur!r})")


def grid_has_date(page, shamsi: str) -> bool:
    body = page.inner_text("body")
    parts = shamsi.split("/")
    alts = {shamsi}
    if len(parts) == 3:
        y, m, d = parts[0], int(parts[1]), int(parts[2])
        alts.add(f"{y}/{m}/{d}")
        alts.add(f"{y}/{m:02d}/{d:02d}")
        # list views sometimes omit year: "سه شنبه 05/27"
        alts.add(f"{m:02d}/{d:02d}")
        alts.add(f"{m}/{d}")
    return any(a in body for a in alts)


def navigate_to_date(page, shamsi: str, shots: Shotter, max_clicks: int = 24) -> None:
    for i in range(max_clicks):
        shots.snap(f"seek-date-prev-{i}-{month_label_text(page)[:40]}")
        if grid_has_date(page, shamsi):
            return
        _click_month(page, "month_prev")
    for i in range(max_clicks):
        shots.snap(f"seek-date-next-{i}-{month_label_text(page)[:40]}")
        if grid_has_date(page, shamsi):
            return
        _click_month(page, "month_next")
    raise RuntimeError(f"date {shamsi!r} not found in ShowDateFile grid")


def scan_grid(page, shots: Shotter) -> tuple[list[LateDay], list[str]]:
    """Return (late queue, all shamsi dates seen on grid)."""
    shots.snap("showdatefile-grid")
    grid = page.locator(XP["grid"])
    rows = grid if grid.count() else page.locator(f"xpath={XP['grid_rows_fallback']}")
    queued: list[LateDay] = []
    all_dates: list[str] = []
    for i in range(rows.count()):
        row = rows.nth(i)
        cells = row.locator("td")
        if cells.count() < 2:
            continue
        day_cell = cells.nth(0)
        day_text = day_cell.inner_text().strip()
        _, shamsi = parse_day_cell(day_text)
        if shamsi:
            all_dates.append(shamsi)
        color = day_cell.evaluate("el => getComputedStyle(el).color")
        entry = cells.nth(1).inner_text().strip()
        d = decide_row(day_text, entry, red_by_color=is_red_color(color))
        if d:
            queued.append(d)
    return queued, all_dates


def _fill(page, selector: str, value: str) -> None:
    loc = page.locator(selector)
    if not loc.count():
        raise RuntimeError(f"missing field {selector}")
    loc.first.click()
    loc.first.fill("")
    loc.first.fill(value)


def _fill_masked_time(page, selector: str, hhmm: str) -> None:
    """Type digits only into MaskedEdit (colon fill becomes '30:')."""
    digits = time_to_mask_digits(hhmm)
    expect = f"{digits[:2]}:{digits[2:]}"
    loc = page.locator(selector).first

    def _got() -> str:
        return page.input_value(selector).replace(" ", "")

    # Backspace after Ctrl+A leaves Ajax MaskedEdit stuck on 00:00.
    loc.click()
    loc.press("Control+a")
    loc.type(digits, delay=60)
    if expect in _got() or _got() == digits:
        return

    loc.click()
    page.keyboard.press("Home")
    loc.type(digits, delay=60)
    if expect in _got() or _got() == digits:
        return

    page.evaluate(
        """([sel, val]) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error('missing ' + sel);
          el.focus();
          el.value = val;
          for (const t of ['input', 'change', 'blur']) {
            el.dispatchEvent(new Event(t, { bubbles: true }));
          }
        }""",
        [selector, expect],
    )
    got = _got()
    if expect not in got and got != digits:
        raise RuntimeError(f"masked time stuck at {got!r} want {expect}")


def request_listed(page, shamsi: str) -> bool:
    """True if TimeLeave archive/list mentions this day (year optional)."""
    body = page.inner_text("body")
    parts = shamsi.split("/")
    if len(parts) == 3:
        md = f"{int(parts[1]):02d}/{int(parts[2]):02d}"
        return shamsi in body or md in body
    return shamsi in body


def submit_one(page, day: LateDay, shots: Shotter, do_submit: bool) -> str:
    page.goto(LEAVE, wait_until="domcontentloaded")
    shots.snap(f"timeleave-open-{day.shamsi_date.replace('/', '-')}")
    page.locator(f"xpath={XP['hourly_radio']}").first.click()
    page.wait_for_selector(XP["leave_date"], timeout=10000)
    shots.snap(f"timeleave-hourly-selected-{day.shamsi_date.replace('/', '-')}")
    _fill(page, XP["leave_date"], day.shamsi_date)
    shots.snap(f"timeleave-date-filled-{day.shamsi_date.replace('/', '-')}")
    _fill_masked_time(page, XP["leave_start"], BASELINE.strftime("%H:%M"))
    shots.snap(f"timeleave-baseline-filled-{day.shamsi_date.replace('/', '-')}")
    _fill_masked_time(page, XP["leave_duration"], day.duration)
    shots.snap(f"timeleave-duration-filled-{day.shamsi_date.replace('/', '-')}")
    _fill(page, XP["leave_note"], NOTE)
    shots.snap(f"timeleave-note-filled-{day.shamsi_date.replace('/', '-')}")
    if not do_submit:
        return "DRY-RUN"

    dialogs: list[str] = []

    def _on_dialog(d) -> None:
        dialogs.append(d.message)
        d.accept()

    page.once("dialog", _on_dialog)
    page.locator(XP["leave_ok"]).first.click()
    page.wait_for_timeout(1500)
    shots.snap(f"timeleave-after-submit-{day.shamsi_date.replace('/', '-')}")
    body = page.inner_text("body")
    if page.locator(XP["leave_ok"]).is_visible():
        return classify_modal_fail(body, dialogs)
    page.goto(LEAVE, wait_until="domcontentloaded")
    shots.snap(f"timeleave-list-verify-{day.shamsi_date.replace('/', '-')}")
    if not request_listed(page, day.shamsi_date):
        return "FAIL: not visible in request list"
    return "OK"


def _merge_unique(dst: dict[str, LateDay], rows: list[LateDay]) -> None:
    for d in rows:
        dst[d.shamsi_date] = d


def collect_queue(
    page,
    shots: Shotter,
    *,
    month: str = "",
    date_filter: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[LateDay]:
    """Build late-day queue for month, single date, or inclusive --from/--to."""
    by_date: dict[str, LateDay] = {}

    if date_from or date_to:
        start = norm_date(date_from or date_to or "")
        end = norm_date(date_to or date_from or "")
        # Visit each spanned month. Keep adjacent bleed — portal often shows
        # late prior-month days on the next month grid — then clip by range.
        for mlabel in months_spanning(start, end):
            select_month(page, mlabel, shots)
            late, _ = scan_grid(page, shots)
            _merge_unique(by_date, late)
        return sorted(
            (d for d in by_date.values() if in_date_range(d.shamsi_date, start, end)),
            key=lambda d: d.shamsi_date,
        )

    want = norm_date(date_filter) if date_filter else None
    if want:
        navigate_to_date(page, want, shots)
        late, _ = scan_grid(page, shots)
        return [d for d in late if d.shamsi_date == want]

    if month:
        select_month(page, month, shots)
        late, _ = scan_grid(page, shots)
        return filter_month_dates(late, month)

    raise ValueError("provide --month and/or --date and/or --from/--to")


def run(
    month: str,
    submit: bool,
    headed: bool,
    date_filter: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    screenshot_dir: Path | None = None,
) -> dict:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        page = browser.new_page()
        shots = Shotter(page, screenshot_dir)
        login(page, shots)
        page.goto(SHOW, wait_until="domcontentloaded")
        shots.snap("showdatefile-landed")
        queued = collect_queue(
            page,
            shots,
            month=month,
            date_filter=date_filter,
            date_from=date_from,
            date_to=date_to,
        )
        results = []
        for d in queued:
            item = asdict(d)
            item["result"] = submit_one(page, d, shots, do_submit=submit)
            results.append(item)
        browser.close()
    return {
        "month": month or None,
        "date_filter": date_filter,
        "date_from": date_from,
        "date_to": date_to,
        "submit": submit,
        "screenshot_dir": str(screenshot_dir) if screenshot_dir else None,
        "count": len(results),
        "note": (
            "empty queue = no late days (entry <= 07:45 or red/missing); not an error"
            if not results
            else None
        ),
        "rows": results,
    }


def main(argv: list[str] | None = None) -> int:
    _configure_stdio()
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "self-check":
        duration_self_check()
        return 0

    ap = argparse.ArgumentParser(description="Late-arrival hourly time-off")
    ap.add_argument("--month", default="", help='e.g. "شهریور 1405" (optional if --date/--from)')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--submit", action="store_true")
    ap.add_argument("--date", help="Only this Shamsi date YYYY/MM/DD")
    ap.add_argument("--from", dest="date_from", help="Inclusive range start YYYY/MM/DD")
    ap.add_argument("--to", dest="date_to", help="Inclusive range end YYYY/MM/DD")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--screenshot-dir", type=Path, help="Save PNG each step")
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args(argv)

    if args.date_from and not args.date_to:
        args.date_to = args.date_from
    if args.date_to and not args.date_from:
        args.date_from = args.date_to
    if not args.month and not args.date and not args.date_from:
        ap.error("provide --month and/or --date and/or --from/--to")

    data = run(
        args.month,
        submit=args.submit,
        headed=args.headed,
        date_filter=args.date,
        date_from=args.date_from,
        date_to=args.date_to,
        screenshot_dir=args.screenshot_dir,
    )
    emit_result(data, args.out)
    if args.submit and any(r.get("result") != "OK" for r in data["rows"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
