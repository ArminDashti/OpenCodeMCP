"""Shamsi date helpers + TFS check-in notes for overtime توضیحات."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path


def _div(a: int, b: int) -> int:
    return a // b


def jalali_to_gregorian(jy: int, jm: int, jd: int) -> date:
    """Convert Jalali Y/M/D → Gregorian date."""
    jy -= 979
    jm -= 1
    jd -= 1
    j_day_no = 365 * jy + _div(jy, 33) * 8 + _div((jy % 33) + 3, 4)
    for i in range(jm):
        j_day_no += 31 if i < 6 else 30
    j_day_no += jd
    g_day_no = j_day_no + 79
    gy = 1600 + 400 * _div(g_day_no, 146097)
    g_day_no = g_day_no % 146097
    leap = True
    if g_day_no >= 36525:
        g_day_no -= 1
        gy += 100 * _div(g_day_no, 36524)
        g_day_no = g_day_no % 36524
        if g_day_no >= 365:
            g_day_no += 1
        else:
            leap = False
    gy += 4 * _div(g_day_no, 1461)
    g_day_no %= 1461
    if g_day_no >= 366:
        leap = False
        g_day_no -= 1
        gy += _div(g_day_no, 365)
        g_day_no = g_day_no % 365
    gd = g_day_no + 1
    sal_a = [0, 31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 0
    while gm < 13 and gd > sal_a[gm]:
        gd -= sal_a[gm]
        gm += 1
    return date(gy, gm, gd)


def parse_shamsi(s: str) -> tuple[int, int, int]:
    parts = s.replace("-", "/").split("/")
    if len(parts) != 3:
        raise ValueError(f"bad shamsi: {s!r}")
    return int(parts[0]), int(parts[1]), int(parts[2])


def shamsi_to_gstr(shamsi: str) -> str:
    y, m, d = parse_shamsi(shamsi)
    g = jalali_to_gregorian(y, m, d)
    return g.strftime("%Y-%m-%d")


def short_note_from_comments(comments: list[str], max_len: int = 48) -> str:
    """Very short توضیح from TFS comments; fallback empty."""
    cleaned: list[str] = []
    for c in comments:
        t = " ".join((c or "").split())
        if not t:
            continue
        t = re.sub(r"^[^:]+:\s*", "", t)
        parts = re.findall(r"\[(?:\d+\.\s*)?([^\]]+)\]", t)
        if parts:
            cleaned.extend(p.strip() for p in parts if p.strip())
        else:
            cleaned.append(t)
    if not cleaned:
        return ""
    # First meaningful phrase from check-in order (not shortest)
    note = cleaned[0]
    if len(note) > max_len:
        note = note[: max_len - 1].rstrip() + "…"
    return note


def _tf_exe() -> str:
    return os.environ.get("TF") or "tf"


def _collection() -> str:
    return os.environ.get(
        "TF_COLLECTION",
        "http://10.10.12.52:8080/tfs/sotwaredpdc",
    )


def _server_roots() -> list[str]:
    raw = os.environ.get("TF_HISTORY_ROOTS", "$/DPDC")
    return [p.strip() for p in raw.split(";") if p.strip()]


def _tf_user() -> str:
    return os.environ.get("TF_HISTORY_USER") or os.environ.get("TF_USERNAME") or ""


def list_checkins_for_day(shamsi: str) -> list[dict]:
    """Return list of {changeset, date, comment, user} for that Shamsi day (Gregorian window)."""
    g = shamsi_to_gstr(shamsi)
    # TFS D range inclusive on dates; use single day
    version = f"D{g}~D{g}"
    user = _tf_user()
    items: list[dict] = []
    for root in _server_roots():
        cmd = [
            _tf_exe(),
            "history",
            root,
            "/recursive",
            f"/version:{version}",
            "/format:detailed",
            "/noprompt",
            f"/collection:{_collection()}",
            "/stopafter:50",
        ]
        if user:
            cmd.append(f"/user:{user}")
        login = os.environ.get("TF_USERNAME")
        password = os.environ.get("TF_PASSWORD")
        if login and password:
            cmd.append(f"/login:{login},{password}")
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
                cwd=os.environ.get("TF_WORKSPACE_DIR") or None,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as e:
            return [{"error": str(e), "shamsi_date": shamsi}]
        text = (proc.stdout or "") + "\n" + (proc.stderr or "")
        items.extend(_parse_history(text, shamsi=shamsi, gregorian=g))
    # de-dupe by changeset id
    seen: set[str] = set()
    uniq: list[dict] = []
    for it in items:
        cid = it.get("changeset") or ""
        key = cid or json.dumps(it, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)
    return uniq


def _parse_history(text: str, *, shamsi: str, gregorian: str) -> list[dict]:
    blocks = re.split(r"(?m)^Changeset:\s*", text)
    out: list[dict] = []
    for block in blocks[1:]:
        lines = block.splitlines()
        cid = (lines[0] if lines else "").strip()
        user = ""
        comment_lines: list[str] = []
        in_comment = False
        for line in lines[1:]:
            if line.startswith("User:"):
                user = line.split(":", 1)[1].strip()
                in_comment = False
            elif line.startswith("Date:"):
                in_comment = False
            elif line.startswith("Comment:"):
                in_comment = True
                rest = line.split(":", 1)[1].strip()
                if rest:
                    comment_lines.append(rest)
            elif in_comment:
                if line.startswith("Items:") or line.startswith("Change:"):
                    in_comment = False
                elif line.strip():
                    comment_lines.append(line.strip())
        comment = " ".join(comment_lines).strip()
        out.append(
            {
                "shamsi_date": shamsi,
                "gregorian": gregorian,
                "changeset": cid,
                "user": user,
                "comment": comment,
            }
        )
    return out


def notes_for_days(shamsi_dates: list[str]) -> dict[str, dict]:
    """Map shamsi → {checkins, note}."""
    result: dict[str, dict] = {}
    for s in shamsi_dates:
        checkins = list_checkins_for_day(s)
        comments = [c.get("comment", "") for c in checkins if c.get("comment")]
        result[s] = {
            "checkins": checkins,
            "note": short_note_from_comments(comments),
        }
    return result


def self_check() -> None:
    # Known: 1404/01/01 ≈ 2025-03-21
    assert shamsi_to_gstr("1404/01/01") == "2025-03-21"
    n = short_note_from_comments(
        ["Source-NewUI: [1. Fix invoice print] [2. Other]"]
    )
    assert n == "Fix invoice print"
    assert short_note_from_comments([]) == ""
    print("tfs_notes.self_check: OK")


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "self-check":
        self_check()
        return 0
    ap = argparse.ArgumentParser(description="TFS notes for overtime days")
    ap.add_argument("--dates", nargs="+", required=True, help="Shamsi YYYY/MM/DD …")
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args(argv)
    data = notes_for_days(args.dates)
    text = json.dumps(data, ensure_ascii=False, indent=2)
    print(text)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
