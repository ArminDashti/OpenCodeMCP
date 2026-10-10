"""Pure helpers for late-arrival hourly time-off (no browser)."""
from __future__ import annotations

import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta

GATE = datetime.strptime("07:45", "%H:%M")
BASELINE = datetime.strptime("07:30", "%H:%M")
NOTE = "امور شخصی"

# Iranian weekend day-name tokens often shown in red
RED_DAY_NAMES = ("پنجشنبه", "جمعه")

# Shamsi month index 1..12 (Persian Yeh form)
MONTH_NAMES = (
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
)

DATE_RE = re.compile(r"(?P<y>\d{4})/(?P<m>\d{1,2})/(?P<d>\d{1,2})")
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")
MONTH_YEAR_RE = re.compile(r"(\d{4})")


@dataclass
class LateDay:
    shamsi_date: str
    day_name: str
    entry: str
    duration: str
    red: bool = False


def norm_fa(s: str) -> str:
    return " ".join((s or "").split()).replace("ي", "ی").replace("ك", "ک")


def parse_hhmm(text: str) -> datetime | None:
    text = (text or "").strip()
    m = TIME_RE.match(text)
    if not m:
        return None
    return datetime.strptime(f"{int(m.group(1)):02d}:{m.group(2)}", "%H:%M")


def fmt_hhmm(delta: timedelta) -> str:
    total = int(delta.total_seconds())
    if total < 0:
        raise ValueError("negative duration")
    h, rem = divmod(total, 3600)
    m = rem // 60
    return f"{h:02d}:{m:02d}"


def duration_from_entry(entry: str) -> str:
    """مدت درخواست = entry − 07:30."""
    t = parse_hhmm(entry)
    if t is None:
        raise ValueError(f"bad entry time: {entry!r}")
    return fmt_hhmm(t - BASELINE)


def is_late(entry: str) -> bool:
    """Late only when entry is strictly after 07:45 (07:45 itself is on time)."""
    t = parse_hhmm(entry)
    return t is not None and t > GATE


def time_to_mask_digits(hhmm: str) -> str:
    """ASP.NET MaskedEdit needs digits only, e.g. 07:30 → 0730."""
    digits = "".join(c for c in (hhmm or "") if c.isdigit())
    if len(digits) != 4:
        raise ValueError(f"bad time for mask: {hhmm!r}")
    return digits


def looks_red_day_name(day_name: str) -> bool:
    return any(n in (day_name or "") for n in RED_DAY_NAMES)


def is_red_color(css_color: str) -> bool:
    """True for red/orange-ish rgb/rgba used on holiday rows."""
    if not css_color:
        return False
    s = css_color.lower().replace(" ", "")
    m = re.search(r"rgba?\((\d+),(\d+),(\d+)", s)
    if not m:
        return "red" in s or "orange" in s
    r, g, b = map(int, m.groups())
    return r >= 180 and g <= 140 and b <= 120 and r > g and r > b


def parse_day_cell(text: str) -> tuple[str, str]:
    """Return (day_name, YYYY/MM/DD) from e.g. 'یکشنبه 1405/06/18'."""
    text = " ".join((text or "").split())
    m = DATE_RE.search(text)
    if not m:
        return text, ""
    date = f"{m.group('y')}/{int(m.group('m')):02d}/{int(m.group('d')):02d}"
    day_name = text[: m.start()].strip()
    return day_name, date


def norm_date(raw: str) -> str:
    parts = (raw or "").replace("-", "/").split("/")
    if len(parts) != 3:
        raise ValueError(f"bad Shamsi date: {raw!r}")
    return f"{parts[0]}/{int(parts[1]):02d}/{int(parts[2]):02d}"


def in_date_range(shamsi: str, start: str | None, end: str | None) -> bool:
    """Inclusive YYYY/MM/DD compare (zero-padded)."""
    d = norm_date(shamsi)
    if start and d < norm_date(start):
        return False
    if end and d > norm_date(end):
        return False
    return True


def month_num(name: str) -> int | None:
    n = norm_fa(name)
    for i, m in enumerate(MONTH_NAMES, start=1):
        if m in n:
            return i
    return None


def parse_month_label(label: str) -> tuple[int, int] | None:
    """Parse 'شهریور 1405' → (6, 1405)."""
    n = norm_fa(label)
    m = MONTH_YEAR_RE.search(n)
    if not m:
        return None
    year = int(m.group(1))
    num = month_num(n)
    if num is None:
        return None
    return num, year


def month_label(num: int, year: int) -> str:
    if not 1 <= num <= 12:
        raise ValueError(f"bad month num: {num}")
    return f"{MONTH_NAMES[num - 1]} {year}"


def months_spanning(start: str, end: str) -> list[str]:
    """Inclusive Shamsi month labels covering [start, end]."""
    s, e = norm_date(start), norm_date(end)
    if s > e:
        raise ValueError(f"start {s} after end {e}")
    sy, sm, _ = (int(x) for x in s.split("/"))
    ey, em, _ = (int(x) for x in e.split("/"))
    out: list[str] = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        out.append(month_label(m, y))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def filter_month_dates(rows: list[LateDay], month: str) -> list[LateDay]:
    """Keep only rows whose shamsi month/year match label (drops bleed from adjacent months)."""
    parsed = parse_month_label(month)
    if not parsed:
        return rows
    num, year = parsed
    prefix = f"{year}/{num:02d}/"
    return [d for d in rows if d.shamsi_date.startswith(prefix)]


def decide_row(
    day_cell: str,
    entry: str,
    *,
    red_by_color: bool | None = None,
) -> LateDay | None:
    """Queue only non-red days with entry > 07:45. Never override the gate here."""
    day_name, shamsi = parse_day_cell(day_cell)
    if not shamsi:
        return None
    red = bool(red_by_color) if red_by_color is not None else looks_red_day_name(day_name)
    if red:
        return None
    if parse_hhmm(entry) is None:
        return None
    if not is_late(entry):
        return None
    return LateDay(
        shamsi_date=shamsi,
        day_name=day_name,
        entry=entry.strip(),
        duration=duration_from_entry(entry),
        red=False,
    )


def classify_modal_fail(body: str, dialogs: list[str] | None = None) -> str:
    """Map portal validation text to a stable FAIL reason."""
    text = body or ""
    if "ساعت شروع را صحیح وارد نمایید" in text:
        return "FAIL: bad start time"
    if "در بازه انتخابی" in text or "درخواست مجوز ساعتی دیگری" in text:
        return "FAIL: overlap pending hourly request"
    dialogs = dialogs or []
    # Prefer a short red-ish portal sentence if present
    for line in text.splitlines():
        line = line.strip()
        if "خطا" in line or "نمی باشد" in line or "نمی‌باشد" in line:
            if 8 <= len(line) <= 120:
                return f"FAIL: {line}"
    return f"FAIL: modal still open dialogs={dialogs!r}"


def self_check() -> None:
    assert duration_from_entry("08:05") == "00:35"
    assert duration_from_entry("07:48") == "00:18"
    assert duration_from_entry("07:30") == "00:00"
    assert is_late("07:48") and not is_late("07:45") and not is_late("07:30")
    assert time_to_mask_digits("07:30") == "0730"
    assert time_to_mask_digits("00:35") == "0035"
    assert decide_row("یکشنبه 1405/06/18", "08:05") is not None
    assert decide_row("پنجشنبه 1405/06/19", "08:50") is None
    assert decide_row("دوشنبه 1405/06/01", "07:30") is None
    assert decide_row("سه شنبه 1405/05/27", "07:30") is None
    assert months_spanning("1405/05/25", "1405/06/24") == [
        "مرداد 1405",
        "شهریور 1405",
    ]
    assert in_date_range("1405/05/25", "1405/05/25", "1405/06/24")
    assert in_date_range("1405/06/24", "1405/05/25", "1405/06/24")
    assert not in_date_range("1405/05/24", "1405/05/25", "1405/06/24")
    assert classify_modal_fail(
        "در بازه انتخابی، درخواست مجوز ساعتی دیگری از جانب شما در حال بررسی می باشد"
    ).startswith("FAIL: overlap")
    print("duration.self_check: OK")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "self-check":
        self_check()
        sys.exit(0)
    rows = json.load(sys.stdin)
    out = []
    for row in rows:
        d = decide_row(
            row.get("day_cell", ""),
            row.get("entry", ""),
            red_by_color=row.get("red"),
        )
        if d:
            out.append(asdict(d))
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    print()
