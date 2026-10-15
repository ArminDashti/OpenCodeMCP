"""
Scan ShowDateFile for overtime and optionally submit OvertimeRequest rows.

Usage:
  python run_overtime.py --month "شهریور 1405" --dry-run
  python run_overtime.py --month "شهریور 1405" --submit
  python run_overtime.py --date 1405/06/18 --dry-run --screenshot-dir shots
  python run_overtime.py self-check

Rules (hard):
  Sat–Tue end 16:30, Wed 15:30 → OT = exit − end when exit > end (بعد وقت).
  Thu / red / Fri → OT = last − first.
  No punches → day-off → skip.
  Never fill قبل وقت.
  --submit only after human confirms dry-run (skill gate).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import asdict
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from overtime import (  # noqa: E402
    OvertimeDay,
    decide_row,
    extract_times,
    is_red_color,
    self_check as overtime_self_check,
    time_to_mask_digits,
)
from tfs_notes import notes_for_days, self_check as tfs_self_check  # noqa: E402

BASE = "http://10.10.16.102:8092"
LOGIN = f"{BASE}/Login.aspx"
SHOW = f"{BASE}/Employee/ShowDateFile.aspx"
OT = f"{BASE}/Employee/OvertimeRequest.aspx"

USER = os.environ.get("ATTENDANCE_USER", "")
PASS = os.environ.get("ATTENDANCE_PASS", "")

ADD_RE = re.compile(r"جدید|اضافه|Add", re.I)
OK_RE = re.compile(r"ثبت|تایید|OK", re.I)

XP = {
    "month_prev": "#ctl00_ContentPlaceHolder1_BtnPreviousMonth",
    "month_next": "#ctl00_ContentPlaceHolder1_BtnNextMonth",
    "month_label": "#ctl00_ContentPlaceHolder1_lblMonth",
    "grid": "#ctl00_ContentPlaceHolder1_GrdShowDataFile tr",
    "grid_rows_fallback": (
        "/html/body/form/div[3]/div/div[2]/div/table/tbody/tr[2]/td/div/table/tbody/tr"
    ),
}


def _norm_fa(s: str) -> str:
    return " ".join((s or "").split()).replace("ي", "ی").replace("ك", "ک")


def _norm_date(raw: str) -> str:
    parts = raw.replace("-", "/").split("/")
    if len(parts) != 3:
        return raw
    return f"{parts[0]}/{int(parts[1]):02d}/{int(parts[2]):02d}"


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
    _fill_by_label(page, "رمز عبور", PASS)
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
        return _norm_fa(loc.first.inner_text())
    root = page.locator("xpath=/html/body/form/div[3]/div/div[2]/div/table/tbody/tr[1]")
    return _norm_fa(root.inner_text() if root.count() else page.inner_text("body"))


def _click_month(page, which: str) -> None:
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


def select_month(page, target: str, shots: Shotter, max_clicks: int = 24) -> None:
    target_n = _norm_fa(target)
    cur = ""
    for i in range(max_clicks):
        cur = month_label_text(page)
        shots.snap(f"month-prev-{i}-{cur[:40]}")
        if target_n in cur:
            return
        _click_month(page, "month_prev")
    for i in range(max_clicks):
        cur = month_label_text(page)
        shots.snap(f"month-next-{i}-{cur[:40]}")
        if target_n in cur:
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


def scan_grid(page, shots: Shotter) -> list[OvertimeDay]:
    shots.snap("showdatefile-grid")
    grid = page.locator(XP["grid"])
    rows = grid if grid.count() else page.locator(f"xpath={XP['grid_rows_fallback']}")
    queued: list[OvertimeDay] = []
    for i in range(rows.count()):
        row = rows.nth(i)
        cells = row.locator("td")
        if cells.count() < 2:
            continue
        day_cell = cells.nth(0)
        day_text = day_cell.inner_text().strip()
        color = day_cell.evaluate("el => getComputedStyle(el).color")
        times: list[str] = []
        for c in range(1, cells.count()):
            times.extend(extract_times(cells.nth(c).inner_text()))
        if not times:
            times = extract_times(row.inner_text())
        d = decide_row(day_text, times, red_by_color=is_red_color(color))
        if d:
            queued.append(d)
    return queued


def _fill_masked_time(page, selector: str, hhmm: str) -> None:
    digits = time_to_mask_digits(hhmm)
    expect = f"{digits[:2]}:{digits[2:]}"
    loc = page.locator(selector).first

    def _got() -> str:
        return page.input_value(selector).replace(" ", "")

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


def _input_near_label(page, label: str):
    loc = page.get_by_label(label, exact=False)
    if loc.count():
        return loc.first
    xp = (
        f"xpath=//*[contains(normalize-space(.), '{label}')]"
        f"/following::input[not(@type='hidden')][1]"
    )
    loc = page.locator(xp)
    if loc.count():
        return loc.first
    xp2 = (
        f"xpath=//td[contains(normalize-space(.), '{label}')]"
        f"/following-sibling::td[1]//input[not(@type='hidden')][1]"
    )
    loc = page.locator(xp2)
    if loc.count():
        return loc.first
    return None


def _form_ready(page) -> bool:
    return bool(_input_near_label(page, "از تاریخ") or _input_near_label(page, "بعد وقت"))


def click_add_green(page, shots: Shotter) -> None:
    """Click OvertimeRequest green add (document+plus) toolbar control."""
    candidates = [
        page.locator("input[type='image'][src*='add' i]"),
        page.locator("img[src*='add' i]"),
        page.locator("a[id*='Add' i], input[id*='Add' i], img[id*='Add' i]"),
        page.locator("xpath=//img[contains(@src,'Add') or contains(@src,'add')]"),
        page.locator(
            "xpath=//input[@type='image' and (contains(@src,'Add') "
            "or contains(@title,'جدید') or contains(@alt,'جدید'))]"
        ),
        page.get_by_role("button", name=ADD_RE),
    ]
    for loc in candidates:
        try:
            if not loc.count():
                continue
            loc.first.click()
            page.wait_for_timeout(800)
            shots.snap("after-add-click")
            if _form_ready(page):
                return
        except Exception:
            continue
    green = page.locator("xpath=//input[@type='image'] | //img")
    for i in range(min(green.count(), 30)):
        el = green.nth(i)
        try:
            box = el.bounding_box()
            if not box or box["y"] > 220:
                continue
            el.click()
            page.wait_for_timeout(800)
            if _form_ready(page):
                shots.snap("after-add-green-heuristic")
                return
        except Exception:
            continue
    raise RuntimeError("could not click OvertimeRequest green add button")


def _set_input(page, label: str, value: str, *, masked: bool = False) -> None:
    loc = _input_near_label(page, label)
    if loc is None:
        raise RuntimeError(f"missing field near label {label!r}")
    handle = loc.evaluate("el => el.id ? '#' + el.id : null")
    if masked and handle:
        _fill_masked_time(page, handle, value)
        return
    if masked:
        digits = time_to_mask_digits(value)
        loc.click()
        loc.press("Control+a")
        loc.type(digits, delay=60)
        return
    loc.click()
    loc.fill("")
    loc.fill(value)


def request_listed(page, shamsi: str) -> bool:
    body = page.inner_text("body")
    parts = shamsi.split("/")
    if len(parts) == 3:
        md = f"{int(parts[1]):02d}/{int(parts[2]):02d}"
        return shamsi in body or md in body
    return shamsi in body


def submit_one(page, day: OvertimeDay, shots: Shotter, do_submit: bool) -> str:
    page.goto(OT, wait_until="domcontentloaded")
    shots.snap(f"ot-open-{day.shamsi_date.replace('/', '-')}")
    click_add_green(page, shots)
    shots.snap(f"ot-form-{day.shamsi_date.replace('/', '-')}")
    _set_input(page, "از تاریخ", day.shamsi_date)
    _set_input(page, "تا تاریخ", day.shamsi_date)
    # بعد وقت only — never قبل وقت
    _set_input(page, "بعد وقت", day.duration, masked=True)
    if day.note:
        try:
            _set_input(page, "توضیحات", day.note)
        except RuntimeError:
            _set_input(page, "توضيحات", day.note)
    shots.snap(f"ot-filled-{day.shamsi_date.replace('/', '-')}")
    if not do_submit:
        return "DRY-RUN"

    dialogs: list[str] = []

    def _on_dialog(d) -> None:
        dialogs.append(d.message)
        d.accept()

    page.once("dialog", _on_dialog)
    ok = page.locator(
        "xpath=//input[@type='submit' or @type='button']"
        "[contains(@value,'ثبت') or contains(@value,'تایید') or contains(@value,'OK') "
        "or contains(@id,'BtnOK') or contains(@id,'btnOk')]"
    )
    if ok.count():
        ok.first.click()
    else:
        page.get_by_role("button", name=OK_RE).first.click()
    page.wait_for_timeout(1500)
    shots.snap(f"ot-after-submit-{day.shamsi_date.replace('/', '-')}")
    page.goto(OT, wait_until="domcontentloaded")
    shots.snap(f"ot-list-verify-{day.shamsi_date.replace('/', '-')}")
    if not request_listed(page, day.shamsi_date):
        return f"FAIL: not visible in list dialogs={dialogs!r}"
    return "OK"


def attach_tfs_notes(queued: list[OvertimeDay], *, skip_tfs: bool) -> list[OvertimeDay]:
    if skip_tfs or not queued:
        return queued
    notes = notes_for_days([d.shamsi_date for d in queued])
    for d in queued:
        info = notes.get(d.shamsi_date) or {}
        d.note = info.get("note") or ""
        setattr(d, "tfs_checkins", info.get("checkins") or [])
    return queued


def run(
    month: str,
    submit: bool,
    headed: bool,
    date_filter: str | None = None,
    screenshot_dir: Path | None = None,
    skip_tfs: bool = False,
) -> dict:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        page = browser.new_page()
        shots = Shotter(page, screenshot_dir)
        login(page, shots)
        page.goto(SHOW, wait_until="domcontentloaded")
        shots.snap("showdatefile-landed")
        want = _norm_date(date_filter) if date_filter else None
        if want:
            navigate_to_date(page, want, shots)
        elif month:
            select_month(page, month, shots)
        queued = scan_grid(page, shots)
        if want:
            queued = [d for d in queued if d.shamsi_date == want]
        queued = attach_tfs_notes(queued, skip_tfs=skip_tfs)
        results = []
        for d in queued:
            item = asdict(d)
            item["tfs_checkins"] = getattr(d, "tfs_checkins", [])
            item["result"] = submit_one(page, d, shots, do_submit=submit)
            results.append(item)
        browser.close()
    return {
        "month": month,
        "date_filter": date_filter,
        "submit": submit,
        "screenshot_dir": str(screenshot_dir) if screenshot_dir else None,
        "count": len(results),
        "note": (
            "empty queue = no OT (on-time exit, day-off, or missing punches); not an error"
            if not results
            else "confirm notes+durations before --submit"
        ),
        "rows": results,
    }


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "self-check":
        overtime_self_check()
        tfs_self_check()
        return 0

    ap = argparse.ArgumentParser(description="Overtime from ShowDateFile → OvertimeRequest")
    ap.add_argument("--month", default="", help='e.g. "شهریور 1405"')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--submit", action="store_true")
    ap.add_argument("--date", help="Only this Shamsi date YYYY/MM/DD")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--screenshot-dir", type=Path)
    ap.add_argument("--skip-tfs", action="store_true", help="Skip TFS note lookup")
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args(argv)
    if not args.month and not args.date:
        ap.error("provide --month and/or --date")

    data = run(
        args.month,
        submit=args.submit,
        headed=args.headed,
        date_filter=args.date,
        screenshot_dir=args.screenshot_dir,
        skip_tfs=args.skip_tfs,
    )
    text = json.dumps(data, ensure_ascii=False, indent=2)
    print(text)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    if args.submit and any(r.get("result") != "OK" for r in data["rows"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
