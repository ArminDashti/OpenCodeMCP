---
name: dpdc-insert-overtime
description: >-
  Scans ShowDateFile for overtime (exit after shift end, or full span on
  Thu/red/Fri), drafts short توضیحات from TFS check-ins, then submits
  OvertimeRequest (بعد وقت only) via Playwright after user confirmation.
  Use when asked to insert, submit, or dry-run overtime for a Shamsi date or
  month, or to draft overtime notes from TFS check-in comments.
disable-model-invocation: false
metadata:
  version: 1.1.0
  author: "Armin Dashti"
  category: attendance
  tags: [attendance, overtime, shamsi, playwright, tfs]
  last_updated: "2026-10-09 22:15:11"
  uuid: b8e4f02a-6c1d-4a9e-8f3b-7d2c9a1e5b84
---
# DPDC Insert Overtime

## When

- User asks to insert / submit overtime from `ShowDateFile` into `OvertimeRequest`
- User asks to dry-run / submit for one Shamsi date or a named month
- User asks for overtime notes from TFS check-in comments
- Exclusions: create/edit-only asks (do not hit the portal); late-arrival hourly time-off → `dpdc-insert-time-off`
- Merges former: `insert-overtime-request`

## How

`$ROOT` = this skill folder (absolute path to `dpdc-insert-overtime/`).

Prefer scripts. Do not re-drive the portal step-by-step in chat unless scripts fail.

| Step | Command |
|------|---------|
| Self-check | `python "$ROOT/scripts/overtime.py" self-check` then `python "$ROOT/scripts/tfs_notes.py" self-check` (or `python "$ROOT/scripts/run_overtime.py" self-check`) |
| Dry-run month | `python "$ROOT/scripts/run_overtime.py" --month "<NAME YYYY>" --dry-run` |
| Dry-run one day | `python "$ROOT/scripts/run_overtime.py" --date YYYY/MM/DD --dry-run` |
| Submit | same flags with `--submit` instead of `--dry-run` |

Optional: `--headed`, `--screenshot-dir <dir>`, `--skip-tfs`, `-o out.json`. Env (required, never hardcode): `ATTENDANCE_USER`, `ATTENDANCE_PASS`; TFS: `TF`, `TF_COLLECTION`, `TF_USERNAME`, `TF_PASSWORD`, `TF_HISTORY_USER`, `TF_HISTORY_ROOTS` (default `$/DPDC`). Needs Playwright Chromium.

1. If month and date both missing → ask once.
2. Run **dry-run**; show JSON `rows` (`shamsi_date`, `entry`, `exit`, `duration`, `kind`, `note`, `tfs_checkins`).
3. If `count=0` for a named day → report on-time exit / day-off / missing punches; **stop**.
4. Show proposed `note` per day (from TFS comments). Wait for explicit user OK.
5. On user OK (or if they already said submit **and** already saw the queue) → run **`--submit`**.
6. Report `date | entry | exit | duration | note | result`. Treat only `result=OK` as success; stop on non-zero exit.

Rules baked into scripts:

| Rule | Value |
|------|--------|
| Sat–Tue shift end | `16:30` |
| Wed shift end | `15:30` |
| After-shift OT | `exit > end` → `exit − end` into **بعد وقت** |
| Thu / Fri / red | `last_exit − first_entry` (full span) |
| Day-off | no punches (or fewer than 2 times) → skip |
| قبل وقت | never fill |
| از/تا تاریخ | same Shamsi day |
| توضیحات | short phrase from that day’s TFS check-in comments |
| Punches | all `HH:MM` in row cells after day; first=entry, last=exit |
| Skip | days absent from scanned grid |
| Month nav | ASP.NET `#BtnPreviousMonth` / `#BtnNextMonth`; wait for `#lblMonth` |
| Month text | normalize `ي`→`ی`, `ك`→`ک` |
| Submit verify | day must appear on OvertimeRequest list |

## Always

1. Empty queue is correct when exit ≤ shift end or day-off — tell the user; do not invent OT.
2. Use skill scripts under `$ROOT/scripts/` — not Cursor IDE browser MCP, not the user’s personal browser.
3. Always dry-run (or show queue) and get confirmation before `--submit`.
4. List TFS check-ins used for each note so the user can correct the توضیح.

## Never

1. Never fill **قبل وقت**.
2. Never submit without user confirmation of the dry-run queue (unless they already confirmed in this turn).
3. Never invent overtime for days with no punches.
4. Never paste full XPath walkthroughs into chat when the script already encodes them.
5. Never run portal scripts when the user only asked to create/edit the skill.
6. Never change shift ends away from 16:30 / 15:30 unless user overrides.

## Example

**Example 1** — Dry-run شهریور

- Input: "file overtime for شهریور 1405"
- Output: `--month "شهریور 1405" --dry-run`; show queue + TFS notes; ask before `--submit`.

**Example 2** — After-shift math

- Input: leave `18:30`, Sat end `16:30`
- Output: `duration=02:00`, `kind=after_shift`, field بعد وقت.

**Example 3** — On-time exit

- Input: exit `16:30` Sat
- Output: not queued; dry-run `count=0`.

**Example 4** — Day-off

- Input: no punches that day
- Output: skipped.

**Example 5** — Thu / red full span

- Input: red day `09:30`–`15:30`
- Output: `duration=06:00`, `kind=full_span`.

**Example 6** — TFS note + confirm

- Input: dry-run shows note `Fix invoice print` from check-in comment
- Output: show note; wait for OK; then `--submit`.

**Example 7** — Self-check

- Input: verify formulas
- Output: `python run_overtime.py self-check` → `OK`.
