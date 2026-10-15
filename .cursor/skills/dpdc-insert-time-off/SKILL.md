---
name: dpdc-insert-time-off
description: >-
  Scans ShowDateFile for non-red workdays with clock-in after 07:45, then
  submits hourly TimeLeave (baseline 07:30, توضیحات امور شخصی) via Playwright
  scripts. Empty queue when entry ≤ 07:45 is correct — never force those days.
  Supports inclusive --from/--to Shamsi ranges; surfaces portal overlap FAILs.
  Use when asked to insert, submit, or dry-run hourly time-off / TimeLeave
  for late arrivals (clock-in after 07:45) for a Shamsi date, month, or range.
disable-model-invocation: false
metadata:
  version: 1.4.0
  author: "Armin Dashti"
  category: attendance
  tags: [attendance, time-off, hourly, late-arrival, shamsi, playwright]
  last_updated: "2026-10-09 22:15:11"
  uuid: a7c3e91f-4b2d-4f8a-9e1c-6d5b8a0f3e72
---
# DPDC Insert Time-Off

## When

- User asks to insert / submit hourly time-off for late morning starts
- User asks to scan `ShowDateFile` and create `TimeLeave` for entries after 07:45
- User asks to dry-run / submit for one Shamsi date, a named month, or an inclusive date range
- Exclusions: create/edit-only asks (do not hit the portal); overtime → `dpdc-insert-overtime`
- Merges former: `insert-hourly-time-off-late-arrival`, `armin-insert-hourly-time-off-late-arrival`, `insert-attendance-time-off`

## How

`$ROOT` = this skill folder (absolute path to `dpdc-insert-time-off/`).

Prefer scripts. Do not re-drive the portal step-by-step in chat unless scripts fail.

| Step | Command |
|------|---------|
| Self-check | `python "$ROOT/scripts/duration.py" self-check` |
| Dry-run month | `python "$ROOT/scripts/run_hourly_time_off.py" --month "<NAME YYYY>" --dry-run` |
| Dry-run range | `python "$ROOT/scripts/run_hourly_time_off.py" --from YYYY/MM/DD --to YYYY/MM/DD --dry-run` |
| Dry-run one day | `python "$ROOT/scripts/run_hourly_time_off.py" --date YYYY/MM/DD --dry-run` |
| Submit | same flags with `--submit` instead of `--dry-run` |

Optional: `--headed`, `--screenshot-dir <dir>`, `-o out.json`. Env (required, never hardcode): `ATTENDANCE_USER`, `ATTENDANCE_PASS`. Needs Playwright Chromium (`playwright install chromium` once if missing).

On Windows, scripts force UTF-8 stdout and write `-o` **before** print so Persian JSON never blocks artifact save.

1. If month, date, and range all missing → ask once.
2. For multi-month spans use **`--from` / `--to`** (inclusive). Do not hand-merge two `--month` dry-runs.
3. Run **dry-run**; show JSON `rows` (`shamsi_date`, `entry`, `duration`).
4. If `count=0` for a named day → report on-time / red / missing; **stop** (do not invent leave).
5. On user OK (or if they already said submit) → run **`--submit`**.
6. Report `date | entry | duration | result`. Treat only `result=OK` as success. Exit code non-zero if any row ≠ OK, but still show every row (script continues after per-day FAIL).
7. If `result` starts with `FAIL: overlap pending` → tell user a pending hourly request already covers that day; do **not** blind-retry until they cancel/approve the existing request.

Rules baked into scripts:

| Rule | Value |
|------|--------|
| Late gate | `entry > 07:45` only (`07:45` and earlier → not queued) |
| مدت | `entry − 07:30` |
| ساعت تردد | `07:30` (MaskedEdit: type digits `0730`, never colon fill) |
| توضیحات | `امور شخصی` |
| Skip | red-text / red-color rows; days not in scanned grid |
| Month nav | ASP.NET `#BtnPreviousMonth` / `#BtnNextMonth`; wait for `#lblMonth` text change (no full navigation) |
| Month match | parse month+year tokens (`ي`→`ی`, `ك`→`ک`); filter rows to that calendar month (drop adjacent bleed) |
| Range | `--from`/`--to` visits each spanned Shamsi month, keeps portal adjacent-month bleed, then clips inclusive endpoints |
| Month-only | after `--month`, keep only rows whose `YYYY/MM` matches that calendar month (drops bleed) |
| Submit verify | modal must close; day must appear on TimeLeave list |
| Modal FAIL | map portal text → `FAIL: overlap pending hourly request` / `FAIL: bad start time` / else short reason |

## Always

1. Treat empty queue as correct when the day is on time — tell the user; do not re-ask to force.
2. Use skill scripts under `$ROOT/scripts/` — not Cursor IDE browser MCP, not the user’s personal browser.
3. Prefer `-o` JSON on Windows so results survive even if the console encoding is wrong.
4. On mixed OK/FAIL, report the full table; only retry `overlap` after the user clears the pending request.

## Never

1. Never submit (or `--force`) days with `entry ≤ 07:45`.
2. Never submit red-text days or days absent from the scanned grid.
3. Never change baseline away from `07:30` or note away from `امور شخصی` unless user overrides.
4. Never paste full XPath walkthroughs into chat when the script already encodes them.
5. Never run portal scripts when the user only asked to create/edit the skill.
6. Never invent a UTF-8 wrapper temp script — `run_hourly_time_off.py` configures stdio itself.
7. Never blind-retry `FAIL: overlap pending hourly request` without user action on the existing request.

## Example

**Example 1** — Dry-run شهریور

- Input: "file late hourly leave for شهریور 1405"
- Output: run `--month "شهریور 1405" --dry-run`; show queue; ask before `--submit`.

**Example 2** — Inclusive range (multi-month)

- Input: "from یکشنبه 1405/05/25 to سه شنبه 1405/06/24 inclusive, skip red"
- Output: `--from 1405/05/25 --to 1405/06/24 --dry-run` (endpoints included; red already skipped).

**Example 3** — Duration math

- Input: entry `08:05`
- Output: script queues `duration=00:35`.

**Example 4** — On time (gate)

- Input: entry `07:45` or `07:30` (e.g. سه شنبه `1405/05/27`)
- Output: not queued; dry-run `count=0`; agent stops — no TimeLeave.

**Example 5** — Red day

- Input: red `پنجشنبه` with `08:50`
- Output: skipped.

**Example 6** — Submit after OK

- Input: user confirms dry-run list
- Output: `--submit`; table of `result=OK|FAIL` (FAIL if bad masked time, overlap pending, or list verify misses).

**Example 7** — Overlap pending

- Input: submit retries a day the portal already has under review
- Output: `FAIL: overlap pending hourly request`; agent explains; no automatic re-submit.

**Example 8** — One date + screenshots

- Input: "dry-run only 1405/06/18 with screenshots"
- Output: `--date 1405/06/18 --dry-run --screenshot-dir <dir>`.

**Example 9** — Self-check

- Input: verify formula / mask digits / range helpers
- Output: `python duration.py self-check` → `OK`.

**Example 10** — User asks force on-time day

- Input: "insert leave anyway for 1405/05/27 even though 07:30"
- Output: refuse; explain gate; do not add `--force` or hand-fill the portal.
