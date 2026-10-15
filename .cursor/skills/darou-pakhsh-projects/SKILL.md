---
name: darou-pakhsh-projects
description: >-
  Guidance for Darou Pakhsh Distribution (DPDC) IT work in Tehran: VB/C# .NET Framework codebases, Pakhsh_Data_New SQL Server, SSRS reports, and TFS version control. Use when editing company ERP code, running SQL, building RDL reports, working with TFS repos, or any Darou Pakhsh / Pakhsh distribution task.
metadata:
  version: 1.0.0
  author: "Armin Dashti"
  category: 
  tags: []
  last_updated: "2026-08-01 16:08:02"
  uuid: 627ff79a-f051-4fc0-8da9-0ce0714cedc5
---
# Darou Pakhsh Distribution Company

## Company Context

- Darou Pakhsh Distribution is a company which distribute in drugs located in Tehran, Iran.
- Armin (Me) in IT department.
- Most of time, you encounter with low-quality codes and old technolgies.
- When you want to create or edit codes in the the company's code bases, you must consider it
- These foolish employees used Finglish for the names, so keep that in mind however, make sure to use standard, professional English names for variables.

## Programming Stack

- Languages: VB, C#
- Framework: .NET Framework

## Key Repositories

| Path | Purpose |
|------|---------|
| `C:/Users/a.dashti/TFS/Source` | Primary codebase currently in use |
| `C:/Users/a.dashti/TFS/Source-NewUI` | New version of Source — in development |
| `C:/Users/a.dashti/TFS/PakhshReports` | Build and deploy RDL reports |
| `C:/Users/a.dashti/TFS/RDL` | RDL files checked out from TFS land here |
| `C:/Users/a.dashti/TFS/SQL` | SQL scripts checked out from TFS land here |
| `C:/Users/a.dashti/TFS/academy` | Academy project |
| `C:/Users/a.dashti/TFS/MiniApp` | MiniApp project |

## SQL Server Database

Usage: `Darou Pakhsh Distribution company database for testing purpose`

| Setting | Value |
|---------|-------|
| Version | `13.0.5026.0` |
| Server collation | `SQL_Latin1_General_CP1256_CI_AS` |
| Driver | `ODBC Driver 17 for SQL Server` |
| Server | `10.10.12.52` |
| Database | `Pakhsh_Data_New` |
| Username | `$env:PAKHSH_DATA_NEW_USERNAME` |
| Password | `$env:PAKHSH_DATA_NEW_PASSWORD` |

### Database Safety Rules (Required)

WARNING: This is a **shared test database**. Follow these rules on every query:

1. Only run `SELECT` unless the user explicitly requests `INSERT`, `UPDATE`, or `DELETE`.
2. Use `TOP N`, narrow `WHERE` filters, and known IDs. Never scan full tables.
3. Always try to write optimize, high-quality and no-bug in SQL codes but with considering the version of the database.
4. No unbounded `UPDATE`/`DELETE`, no large inserts during debugging.
5. Confirm with the user before any data-changing statement.
6. Use `WITH (NOLOCK)` when you think is neccesary.
7. Because most of task add a something new, edit a SQL code with considering untouch current part of SQL code which irrealtive with the current task.
8. Some SPs, table, function, triggers or views can be unused, so, always keep the issue in your mind.
9. Execute `DELETE` only with user permission.
10. Never log or echo passwords in chat, logs, or commit messages.

For schema reference, see [schemas.md](schemas.md).

## SQL Server Reporting Services

| Setting | Value |
|---------|-------|
| Version | `16.131.28002.2` |

### SSRS Safety Rules (Required)

This is a **shared production database**. Follow these rules on every query:

1. **Read-only by default** — only run `SELECT` unless the user explicitly requests `INSERT`, `UPDATE`, or `DELETE`.
2. **Always limit scope** — use `TOP N`, narrow `WHERE` filters, and known IDs. Never scan full tables.
3. **Prefer newest data** — `ORDER BY ... DESC` then `TOP` when sampling rows.
4. **No bulk mutations** — no unbounded `UPDATE`/`DELETE`, no large inserts during debugging.
5. **Ask before writes** — confirm with the user before any data-changing statement.
6. **Use `WITH (NOLOCK)`** for exploratory reads when the app codebase does (match existing `*_DB.vb` style).
7. **Never log or echo passwords** in chat, logs, or commit messages.
8. Some SPs, table, function, triggers or views can be unused, so, always keep the issue in your mind.

## Team Foundation Server

| Setting | Value |
|---------|-------|
| Version | `16.131.28002.2` |

TFS workspace root: `C:/Users/a.dashti/TFS/`
