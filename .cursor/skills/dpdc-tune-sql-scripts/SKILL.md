---
name: dpdc-tune-sql-scripts
description: >-
  Tunes, optimizes, or speeds up any SQL Server script on the DPDC / Pakhsh
  database (Pakhsh_Data_New): stored procedures, functions, views, triggers,
  ad-hoc queries, and batch/maintenance scripts. Uses scenario sampling from
  new data, baseline and post-tune CSV exports, and requires identical result
  sets before accepting the optimized script, then ends with a fixed
  What-was-changed list and one-row Old / New / Diff % table. Use when the
  user asks to tune, optimize, improve, or speed up a SQL script, query, or
  stored procedure on DPDC / Pakhsh.
disable-model-invocation: false
metadata:
  version: 3.0.0
  author: "Armin Dashti"
  category: database
  tags: [dpdc, pakhsh, sql-server, stored-procedure, function, view, trigger, query, script, tune, optimize, sample, csv, parity]
  last_updated: "2026-10-09 22:13:19"
  uuid: 569f85e0-1c63-4b52-9d22-dfa36d6f514c
---

# DPDC tune SQL scripts

## When

- User asks to tune, optimize, improve, or speed up a SQL Server script on the DPDC / Pakhsh database:
  - stored procedure (SP)
  - function, view, trigger
  - ad-hoc query
  - batch / maintenance script
- Exclusions: create/edit without a performance goal; wrong results / bug finding — not this skill
- Connection, read-only/load limits, schema map, and naming: follow [`../dpdc-db-policy/SKILL.md`](../dpdc-db-policy/SKILL.md) (do not repeat those rules here)
- Merges former: `improve-sql-server-sp`, `improve-sql-stored-procedure`

## How

### Step 1: Lock the target

1. Name the object or script (`schema.name` for SP/function/view/trigger; file path for ad-hoc/batch scripts), database, and connection (per `dpdc-db-policy`).
2. Capture the current definition (`OBJECT_DEFINITION` / script) as the rollback source.
3. List every input parameter and which ones vary by scenario.

### Step 2: Define scenarios

1. Split real usage into scenarios (distinct parameter shapes or business cases), e.g. by date range, customer class, status filter, page size.
2. Default **20 samples per scenario** unless the user sets another count.
3. Prefer **new data**: draw keys/rows from recent or newly inserted business data (e.g. latest `CREATE_DATE` / identity / log), not old fixed fixtures.
4. Persist the chosen input set so baseline and after-tune runs use the **same** parameters.

### Step 3: Baseline sample folder

1. Create one working folder (ask if unset), e.g. `.armin/tmp/sp-tune-<schema>-<name>/`.
2. Under it use:

| Subfolder | Contents |
|-----------|----------|
| `inputs/` | One file per sample: parameter values (`*.json` or `*.csv`) |
| `baseline/` | One result CSV per sample from the **current** script |
| `after/` | One result CSV per sample from the **tuned** script |
| `compare/` | Diff / mismatch reports |

3. File naming: `<scenario-slug>-<nn>.csv` (and matching `inputs/<scenario-slug>-<nn>.json`), `nn` = `01`…`20` (or the agreed count).
4. Each sample is a **separate** CSV — never merge scenarios into one file.
5. Run the current script once per sample; export the full result set (or each result set if multiple) to `baseline/`.
6. Record wall time / reads / CPU per sample when available (notes file or columns in a `baseline/manifest.csv`).

### Step 4: Optimize

1. Tune only for performance (plan, indexes used by the script, set-based rewrites, parameter sniffing mitigations, unnecessary work removed).
2. Do **not** change result columns, row membership, aggregates, or business rules.
3. Apply the candidate change (SP: `ALTER PROCEDURE`; or supporting indexes) only after baseline CSVs exist.
4. Keep the original script ready for rollback.

### Step 5: After-tune samples

1. Re-run the **same** `inputs/` against the tuned script.
2. Write each result to `after/<scenario-slug>-<nn>.csv` with the same naming as baseline.
3. Record timings the same way as baseline.

### Step 6: Compare (must match)

1. For every sample file, compare `baseline/` vs `after/` for that same name.
2. Require **identical outputs**: same columns, same row count, same cell values.
3. Default compare: ordered row-by-row. If the script has no guaranteed order, sort both sides on a stable key set before compare and state that in the report.
4. Write mismatches under `compare/` (which file, which row/column, baseline vs after).
5. Verdict:
   - **All match** → keep the tuned script; continue to the end report.
   - **Any mismatch** → rollback to the original definition; do not leave a behavior-changing “optimization” applied. Still emit the end report (list attempted changes; performance row may show no gain / N/A if rolled back).
6. Optional detail grid (scenario, samples, matches, mismatches) may appear earlier; it does **not** replace Step 7.

### Step 7: End report (required)

At the end of every tune run, report **exactly** in this shape (before Turn Report / other wrap-ups):

```markdown
What was changed:
1. <first concrete change to the script and/or indexes>
2. <second change>
...
```

Then **one** markdown table with **exactly one data row** and these columns:

| Old performance | New performance | Diff % |
|-----------------|-----------------|--------|
| <baseline metric> | <after-tune metric> | <percent change> |

Rules for the table:

1. Prefer one aggregate metric (e.g. total or average wall time across samples). Use the same unit on Old and New (ms, s, etc.).
2. `Diff %` = `((Old − New) / Old) × 100` when Old > 0 (positive = faster). Round sensibly (e.g. one decimal). If Old is 0 or timings missing, write `N/A` and say why in one short clause under the table.
3. Numbered list under `What was changed:` — one item per real change (script text, index DDL, plan hint). If nothing was kept (rollback), still list what was tried, then state rollback.

### Step 8: Cleanup policy

1. Keep the CSV folder when the user asked to store samples; otherwise ask before deleting `.armin/tmp/...`.
2. Do not skip Step 7 even when cleaning up or rolling back.

## Always

1. Sample from new/recent data unless the user names a fixed dataset.
2. Use the same inputs for baseline and after-tune.
3. Treat output parity as a hard gate for accepting the tune.
4. Confirm before data-changing DML outside the definition being tuned; prefer read-only sampling queries (see `dpdc-db-policy` safety rules).
5. End every tune with `What was changed:` (numbered list) plus the one-row Old / New / Diff % table.

## Never

1. Accept a tuned script when any baseline/after CSV pair differs.
2. Merge all samples into one CSV.
3. Optimize by changing business results “a little” to go faster.
4. Drop the original definition before parity passes.
5. End a tune without the `What was changed:` list and the one-row Old / New / Diff % table.
6. Put more than one data row in the performance table, or rename those three columns.

## Examples

**Example 1 — Default 20 samples, two scenarios (SP)**

- Input: "Tune `dbo.usp_OrderList`; scenarios: open orders and closed orders."
- Output: 20 inputs each → 40 CSVs in `baseline/`, tune, 40 in `after/`, all pairs identical → keep tune.

**Example 2 — Sample from new data**

- Input: "Use the newest invoices only."
- Output: pick parameter keys from recent invoice rows (`TOP` / latest dates), not year-old IDs; still 20 per scenario unless overridden.

**Example 3 — Separate CSV files**

- Input: "Save every run as its own file."
- Output: `baseline/open-01.csv` … `open-20.csv`, `closed-01.csv` … — never one combined `all.csv`.

**Example 4 — Parity failure → rollback**

- Input: tune changes a `JOIN` and drops rows.
- Output: `compare/` shows mismatches; `ALTER` rolled back to original script; report fail.

**Example 5 — Custom sample count**

- Input: "5 samples per scenario is enough."
- Output: use 5 instead of 20; same folder layout and parity gate.

**Example 6 — Unordered result set**

- Input: script has no `ORDER BY`.
- Output: sort both CSVs on a stable key before compare; note sorted compare in the report; cells must still match.

**Example 7 — Index-only tune**

- Input: "Only add indexes; do not edit the script text."
- Output: baseline CSVs → create indexes → after CSVs → parity must still pass; end report lists the index DDL under `What was changed:` and one performance row.

**Example 8 — Required end report (SP)**

- Input: tune finishes with parity pass; average wall time 1200 ms → 450 ms.
- Output ending:

```markdown
What was changed:
1. Replaced cursor loop with set-based JOIN in dbo.usp_OrderList.
2. Added nonclustered index IX_Orders_Status_Date on dbo.Orders (Status, OrderDate) INCLUDE (CustomerId).

| Old performance | New performance | Diff % |
|-----------------|-----------------|--------|
| 1200 ms avg | 450 ms avg | 62.5% |
```
