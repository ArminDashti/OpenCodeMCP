---
name: dpdc-db-policy
description: >-
  Policy for working with the DPDC / Pakhsh workplace SQL Server database
  (Pakhsh_Data_New): connect via environment variables only, read-only and
  narrowly scoped queries on a shared database, schema map, Finglish naming,
  and a verify-by-sample workflow for optimizing queries and stored procedures.
  Use whenever querying, debugging, editing stored procedures, or optimizing
  scripts on the DPDC / Pakhsh database.
disable-model-invocation: false
metadata:
  version: 1.1.0
  author: "Armin Dashti"
  tags: [dpdc, pakhsh, database, sql-server, policy]
  last_updated: "2026-10-09 17:25:53"
  uuid: 1406ea2e-b6e0-4b13-a6b3-e7b0454d38d9
---
# DPDC DB Policy

Merges former: `dpdc-database`, `pakhsh-database`, `armin-pakhsh-database`.

## Connection

Use environment variables only; never hardcode credentials in rules, skills, or repos.

| Variable | Purpose |
|----------|---------|
| `PAKHSH_DATA_NEW_DB_SQL_SERVER_CONNECTION_STRING` | Full ADO connection string (preferred) |
| `PAKHSH_DB_SERVER` | Server host |
| `PAKHSH_DB_NAME` | Database name |
| `PAKHSH_DB_USER` | Username |
| `PAKHSH_DB_PASSWORD` | Password (required if not using the full connection string) |
| Driver | ODBC Driver 17 for SQL Server |

Connect through the database MCP if one is available; otherwise use `sqlcmd`.

## Safety rules

The database is shared with co-workers, so keep load minimal.

- Only run `SELECT` unless the user explicitly requests `INSERT`, `UPDATE`, or `DELETE`.
- Confirm with the user before any data-changing statement.
- Use `TOP N`, narrow `WHERE` filters, and known IDs. Never scan full tables or `SELECT` huge data.
- When sampling rows, `ORDER BY ... DESC` then `TOP`.
- No unbounded `UPDATE`/`DELETE`, no large inserts during debugging.

## Common schemas

| Schema | Contents |
|--------|----------|
| Global | Users (`Afrad`), locations, shared master data |
| Sales | Sales orders, reports, IMED |
| Purchase | Suppliers (`TaminKonandeh`) |
| WareHouse | Inventory, kardex, sefaresh |
| FinancialAccounting | Accounts, sanad, tafsily |
| AssetAccounting | Fixed assets (amval) |
| Budget | Budget / sorat maly |
| dbo | System tables, permissions |

## Quirks

- Do not expect clean or consistent logic in this legacy database; think twice before trusting unfamiliar objects.
- Most names are Finglish (for example `TaminKonandeh` instead of `Supplier`).

## Optimization

- Write every new query or stored procedure in an optimized way for the server's SQL Server version.
- When editing a stored procedure, report any bug or performance improvement you notice to the user.
- When asked to optimize a query or script: first run the current (old) version on varied small samples and store the results, then optimize; the optimization succeeds only if old and new results match.

## Reference files

`tables.md`, `store-procedures.md`, `functions.md`, `triggers.md`: object lists for `Pakhsh_Data_New` (currently placeholders).
