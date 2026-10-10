---
name: dpdc-dev-policy
description: >-
  Mandatory development policy for Darou Pakhsh Distribution (DPDC) work:
  VB/C# .NET Framework ERP code, Pakhsh_Data_New SQL Server, SSRS, and TFS.
  Use on every DPDC coding, SQL, report, or repo task — connection rules,
  safety, naming, optimization, and key paths.
author: "Armin Dashti"
uuid: ba80a881-5910-4a7a-8d8b-ad90f6792c39
---

# DPDC development policy

## When to use

- Any Darou Pakhsh / DPDC / Pakhsh distribution task
- Editing company ERP code (VB / C# .NET Framework)
- SQL against `Pakhsh_Data_New`, SSRS/RDL work, or TFS checkouts

## Hard rules

1. Treat this as **policy**, not optional tips, for DPDC work.
2. **Credentials only from environment variables** — never hardcode passwords in skills, rules, repos, chat, or logs.
3. **Read-only SQL by default** (`SELECT` only) unless the user explicitly asks for `INSERT` / `UPDATE` / `DELETE`.
4. Confirm with the user before any data-changing statement.
5. Prefer standard English names in **new** code; expect legacy **Finglish** names in existing DB and apps (`TaminKonandeh` = supplier, etc.).
6. Explicit user instructions for this task win for that task only.

## Company context

- Darou Pakhsh Distribution — drug distribution, Tehran; Armin in IT.
- Codebases and DB are legacy: uneven quality, old stack. Think twice on odd schemas or dead-looking objects; many SPs/tables/views may be unused.
- Do not assume clean domain modeling; verify with evidence in code and DB.

## Stack

| Area | Standard |
|------|----------|
| Languages | VB, C# |
| Framework | .NET Framework |
| Database | SQL Server `Pakhsh_Data_New` (shared test DB; version ~13.x) |
| Collation | `SQL_Latin1_General_CP1256_CI_AS` |
| Driver | ODBC Driver 17 for SQL Server |
| Reports | SSRS / RDL |
| VCS | TFS under `C:/Users/a.dashti/TFS/` |

## Key repositories

| Path | Purpose |
|------|---------|
| `C:/Users/a.dashti/TFS/Source` | Primary codebase in use |
| `C:/Users/a.dashti/TFS/Source-NewUI` | New UI — in development |
| `C:/Users/a.dashti/TFS/PakhshReports` | Build/deploy RDL reports |
| `C:/Users/a.dashti/TFS/RDL` | RDL checkouts |
| `C:/Users/a.dashti/TFS/SQL` | SQL script checkouts |
| `C:/Users/a.dashti/TFS/academy` | Academy |
| `C:/Users/a.dashti/TFS/MiniApp` | MiniApp |

## Database connection

Prefer env vars (never paste secrets into files):

| Variable | Purpose |
|----------|---------|
| `PAKHSH_DATA_NEW_DB_SQL_SERVER_CONNECTION_STRING` | Full ADO connection string (preferred) |
| `PAKHSH_DB_SERVER` / `PAKHSH_DATA_NEW` host | Server |
| `PAKHSH_DB_NAME` | Database (typically `Pakhsh_Data_New`) |
| `PAKHSH_DB_USER` / `PAKHSH_DATA_NEW_USERNAME` | Username |
| `PAKHSH_DB_PASSWORD` / `PAKHSH_DATA_NEW_PASSWORD` | Password |

Connect via MCP if available; otherwise `sqlcmd` / ODBC Driver 17.

Non-secret reference host often used: `10.10.12.52` / `Pakhsh_Data_New` — still authenticate only via env.

### SQL safety (shared DB — coworkers use it too)

1. `SELECT` only unless user explicitly requests writes.
2. Always `TOP N`, tight `WHERE`, known IDs — **never** full-table scans or huge result dumps.
3. Sample with `ORDER BY … DESC` then `TOP`.
4. No unbounded `UPDATE`/`DELETE`; no large inserts while debugging.
5. Use `WITH (NOLOCK)` for exploratory reads when matching existing `*_DB.vb` style.
6. When editing SPs/scripts, leave unrelated sections untouched.
7. Assume some objects may be unused — verify before relying on them.
8. Never log or echo passwords.

Schema cheat-sheet: [references/schemas.md](references/schemas.md). Also: [tables.md](references/tables.md), [store-procedures.md](references/store-procedures.md), [functions.md](references/functions.md), [triggers.md](references/triggers.md).

### Common schemas

| Schema | Contents |
|--------|----------|
| Global | Users (`Afrad`), locations, shared master data |
| Sales | Orders, reports, IMED |
| Purchase | Suppliers (`TaminKonandeh`) |
| WareHouse | Inventory, kardex, sefaresh |
| FinancialAccounting | Accounts, sanad, tafsily |
| AssetAccounting | Fixed assets (amval) |
| Budget | Budget / sorat maly |
| dbo | System tables, permissions |

### SQL optimization

1. Write new queries/SPs for the actual SQL Server version in use.
2. If editing an SP and you spot a bug or clear performance win, tell the human.
3. When asked to optimize: sample varied small rows with the **old** script, store expected results, optimize, then compare — only treat as success if results match.

## SSRS

- Match project SSRS version in use; same read-only-by-default and scoped-query rules as SQL when querying report data sources.
- Build/deploy via `PakhshReports` / RDL paths above; prefer the dedicated SSRS skill when building/deploying.

## Naming in code

- **New** identifiers: clear professional English (see coding `armin-dev-policies` naming guide).
- **Existing** DB/app names: keep Finglish as in source; do not mass-rename.

## Do not

- Hardcode or print DB passwords
- Run wide scans or bulk mutations on the shared DB
- Assume clean architecture or perfect naming in legacy objects
- Rewrite unrelated SQL while fixing a narrow task