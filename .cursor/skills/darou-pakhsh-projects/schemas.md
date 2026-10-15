Microsoft SQL Server Reporting Service
version: `16.131.28002.2`


## Safety Rules (Required)

This is a **shared production database**. Follow these rules on every query:

1. **Read-only by default** — only run `SELECT` unless the user explicitly requests `INSERT`, `UPDATE`, or `DELETE`.
2. **Always limit scope** — use `TOP N`, narrow `WHERE` filters, and known IDs. Never scan full tables.
3. **Prefer newest data** — `ORDER BY ... DESC` then `TOP` when sampling rows.
4. **No bulk mutations** — no unbounded `UPDATE`/`DELETE`, no large inserts during debugging.
5. **Ask before writes** — confirm with the user before any data-changing statement.
6. **Use `WITH (NOLOCK)`** for exploratory reads when the app codebase does (match existing `*_DB.vb` style).
7. **Never log or echo passwords** in chat, logs, or commit messages.
8. Some SPs, table, function, triggers or views can be unused, so, always keep the issue in your mind.

Important repo are in
C:/Users/a.dashti/TFS/Source
Source which currently is using.

C:/Users/a.dashti/TFS/Source-NewUI
New version of `Source` code base which currently is using.

C:/Users/a.dashti/TFS/PakhshReports
A place for buidling and deploying RDL files (Reports)

C:/Users/a.dashti/TFS/RDL
When user get any RDL from TFS, they are ground in the folder.

C:/Users/a.dashti/TFS/SQL
When user get any SQL scripts from TFS, they are ground in the folder.