"""Pure overtime helpers (no browser)."""
from __future__ import annotations

import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta

TIME_RE = re.compile(r"(\d{1,2}):(\d{2})")
DATE_RE = re.compile(r"(?P<y>\d{4})/(?P<m>\d{1,2})/(?P<d>\d{1,2})")

# Shift end for Sat–Wed. Thu/Fri and red days use full span (last − first).
SHIFT_END = {
    "شنبه": "16:30",
    "یکشنبه": "16:30",
    "دوشنبه": "16:30",
    "سه شنبه": "16:30",
    "سه‌شنبه": "16:30",
    "چهارشنبه": "15:30",
}
FULL_SPAN_NAMES = ("پنجشنبه", "جمعه")
RED_DAY_NAMES = ("پنجشنبه", "جمعه")


@dataclass
class OvertimeDay:
    shamsi_date: str
    day_name: str
    entry: str
    exit: str
    duration: str
    kind: str  # after_shift | full_span
    red: bool = False
    note: str = ""


def parse_hhmm(text: str) -> datetime | None:
    text = (text or "").strip()
    m = TIME_RE.fullmatch(text)
    if not m:
        return None
    return datetime.strptime(f"{int(m.group(1)):02d}:{m.group(2)}", "%H:%M")


def fmt_hhmm(delta: timedelta) -> str:
    total = int(delta.total_seconds())
    if total <= 0:
        raise ValueError("non-positive duration")
    h, rem = divmod(total, 3600)
    m = rem // 60
    return f"{h:02d}:{m:02d}"


def extract_times(text: str) -> list[str]:
    """All HH:MM tokens in a row (order preserved)."""
    out: list[str] = []
    for m in TIME_RE.finditer(text or ""):
        t = f"{int(m.group(1)):02d}:{m.group(2)}"
        if parse_hhmm(t):
            out.append(t)
    return out


def time_to_mask_digits(hhmm: str) -> str:
    digits = "".join(c for c in (hhmm or "") if c.isdigit())
    if len(digits) != 4:
        raise ValueError(f"bad time for mask: {hhmm!r}")
    return digits


def looks_red_day_name(day_name: str) -> bool:
    return any(n in (day_name or "") for n in RED_DAY_NAMES)


def is_red_color(css_color: str) -> bool:
    if not css_color:
        return False
    s = css_color.lower().replace(" ", "")
    m = re.search(r"rgba?\((\d+),(\d+),(\d+)", s)
    if not m:
        return "red" in s or "orange" in s
    r, g, b = map(int, m.groups())
    return r >= 180 and g <= 140 and b <= 120 and r > g and r > b


def parse_day_cell(text: str) -> tuple[str, str]:
    text = " ".join((text or "").split())
    m = DATE_RE.search(text)
    if not m:
        return text, ""
    date = f"{m.group('y')}/{int(m.group('m')):02d}/{int(m.group('d')):02d}"
    day_name = text[: m.start()].strip()
    return day_name, date


def _norm_day(day_name: str) -> str:
    return " ".join((day_name or "").replace("ي", "ی").replace("ك", "ک").split())


def _day_token(day_name: str) -> str:
    """First Persian weekday token; longest match wins (شنبه ⊂ چهارشنبه)."""
    n = _norm_day(day_name)
    # Longest first so شنبه does not steal یکشنبه/چهارشنبه/…
    keys = (
        "چهارشنبه",
        "سه‌شنبه",
        "سه شنبه",
        "یکشنبه",
        "دوشنبه",
        "پنجشنبه",
        "جمعه",
        "شنبه",
    )
    for k in keys:
        if n.startswith(k) or f" {k}" in f" {n}":
            return k
    return n


def shift_end_for(day_name: str) -> str | None:
    tok = _day_token(day_name)
    if tok in SHIFT_END:
        return SHIFT_END[tok]
    # Alias سه شنبه / سه‌شنبه
    if tok in ("سه شنبه", "سه‌شنبه"):
        return SHIFT_END.get("سه شنبه") or SHIFT_END.get("سه‌شنبه")
    return None


def is_full_span_day(day_name: str, *, red: bool) -> bool:
    if red:
        return True
    tok = _day_token(day_name)
    return tok in FULL_SPAN_NAMES


def overtime_duration(
    day_name: str, entry: str, exit: str, *, red: bool
) -> tuple[str, str] | None:
    """Return (duration, kind) or None if no OT / day-off / on-time exit."""
    t_in = parse_hhmm(entry)
    t_out = parse_hhmm(exit)
    if t_in is None or t_out is None:
        return None
    if t_out < t_in:
        return None
    if is_full_span_day(day_name, red=red):
        return fmt_hhmm(t_out - t_in), "full_span"
    end = shift_end_for(day_name)
    if end is None:
        return None
    t_end = parse_hhmm(end)
    assert t_end is not None
    if t_out <= t_end:
        return None
    return fmt_hhmm(t_out - t_end), "after_shift"


def decide_row(
    day_cell: str,
    times: list[str] | None = None,
    *,
    row_text: str = "",
    red_by_color: bool | None = None,
) -> OvertimeDay | None:
    """Queue OT days. No punches → day-off → skip. Never fill قبل وقت."""
    day_name, shamsi = parse_day_cell(day_cell)
    if not shamsi:
        return None
    punches = list(times or [])
    if not punches and row_text:
        punches = extract_times(row_text)
    if len(punches) < 2:
        return None
    entry, exit_t = punches[0], punches[-1]
    red = bool(red_by_color) if red_by_color is not None else looks_red_day_name(day_name)
    got = overtime_duration(day_name, entry, exit_t, red=red)
    if not got:
        return None
    duration, kind = got
    return OvertimeDay(
        shamsi_date=shamsi,
        day_name=day_name,
        entry=entry,
        exit=exit_t,
        duration=duration,
        kind=kind,
        red=red,
    )


def self_check() -> None:
    # Sat leave 18:30 → end 16:30 → 02:00
    d = decide_row("شنبه 1405/06/20", ["07:45", "18:30"])
    assert d and d.duration == "02:00" and d.kind == "after_shift"
    # Wed leave 18:30 → end 15:30 → 03:00
    d = decide_row("چهارشنبه 1405/06/17", ["07:50", "18:30"])
    assert d and d.duration == "03:00"
    # On-time exit → no OT
    assert decide_row("دوشنبه 1405/06/15", ["07:45", "16:30"]) is None
    assert decide_row("دوشنبه 1405/06/15", ["07:45", "16:00"]) is None
    # Day-off (no punches)
    assert decide_row("دوشنبه 1405/06/15", []) is None
    assert decide_row("دوشنبه 1405/06/15", ["08:00"]) is None
    # Thu / red full span
    d = decide_row("پنجشنبه 1405/06/19", ["09:30", "15:30"], red_by_color=True)
    assert d and d.duration == "06:00" and d.kind == "full_span"
    d = decide_row("جمعه 1405/06/20", ["10:00", "14:00"])
    assert d and d.duration == "04:00"
    # Mid-day punches: first/last
    d = decide_row("یکشنبه 1405/06/18", ["07:50", "12:00", "13:00", "18:30"])
    assert d and d.entry == "07:50" and d.exit == "18:30" and d.duration == "02:00"
    assert time_to_mask_digits("02:00") == "0200"
    print("overtime.self_check: OK")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "self-check":
        self_check()
        sys.exit(0)
    rows = json.load(sys.stdin)
    out = []
    for row in rows:
        d = decide_row(
            row.get("day_cell", ""),
            row.get("times"),
            row_text=row.get("row_text", ""),
            red_by_color=row.get("red"),
        )
        if d:
            out.append(asdict(d))
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    print()
