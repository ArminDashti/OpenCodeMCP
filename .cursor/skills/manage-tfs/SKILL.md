---
name: manage-tfs
description: >-
  Handles Team Foundation Version Control (TFS / TFVC) work in two modes: Get (get latest, tf get, workspace sync) and Check-in (pending + local-vs-server review, data-safe pend, approval-gated tf checkin, TFS-compliant Pakhsh SQL stored procedures).
disable-model-invocation: false
metadata:
  version: 2.0.0
  author: "Armin Dashti"
  tags: [tfs, tfvc, get, check-in, changeset, folderdiff, data-safe, dpdc, sql, stored-procedure]
  last_updated: "2026-10-09 13:30:00"
  uuid: 3fde00f1-c7bc-42af-b49f-6bee4c791205
---
# Manage TFS

## When

- User asks for TFVC get latest / `tf get` / workspace sync → **Get mode**
- User asks to check in, run `tf checkin`, submit a changeset, or review pending TFVC changes → **Check-in mode**
- User asks for a TFS-compliant / Pakhsh SQL stored procedure → [SQL stored procedures](#sql-stored-procedures)
- Exclusions: Git / GitHub workflows; checking in more than one repo in one run
- Related: `darou-pakhsh-projects`
- Docs: [reference.md](reference.md) (tf.exe, folderdiff, data-safe pend, exclusions), [examples.md](examples.md)
- Merges former: `TFS` (router), `maintain-tfs`, `tfs-get`, `dpdc-tfs-get`, `tfs-check-in-this-project`, `dpdc-tfs-check-in-this-project`

## Common setup (both modes)

1. **Connection** from env — never hardcode or echo passwords:

| Variable | Purpose |
|----------|---------|
| `TF` | Path to `tf.exe` (else resolve VS Team Explorer `TF.exe`, see reference) |
| `TF_ADDRESS` | Team project / portal URL |
| `TF_USERNAME` | TFS login user |
| `TF_PASSWORD` | Secret — use only via `$env:TF_PASSWORD` |

| Item | Value |
|------|-------|
| Collection URL (`/collection:`) | `http://10.10.12.52:8080/tfs/sotwaredpdc` |
| Team project (server) | `$/DPDC/...` |
| Domain | `DPDC` / `DPDC.LOCAL` |

Auth: prefer Windows integrated / cached credentials; if needed `/login:$env:TF_USERNAME,$env:TF_PASSWORD` (never log the password).

2. **Resolve RepoName + local root**

| Rule | Action |
|------|--------|
| User names a repo | Use that exact spelling |
| User gives a path | Folder name = RepoName; path = local root |
| Unnamed (`this repo`, `here`) | Current prompt project |
| Named repo conflicts with cwd | User-named repo wins; `cd` there |

Known roots (extend from `tf workfold`): `Source`, `Source-NewUI`, `PakhshReports`, `RDL`, `SQL`, `academy`, `MiniApp` → `C:/Users/armin/TFS/<RepoName>` (or this machine's mapped `.../TFS/<RepoName>`).

3. **Confirm mapping**: `cd <root>; tf workfold .; tf workspaces` → report RepoName, collection, server `$/...`, local root. Never reuse collection/workspace paths from an old chat.

## Mode: Get

1. `tf status . /recursive` first — if local pending edits exist, list them and warn before getting.
2. Get latest for the requested scope: `tf get <path or .> /recursive /noprompt`.
3. **Never** use `/force` or overwrite/replace prompts on files with local edits unless the user explicitly approves.
4. Report updated / up-to-date / conflicted files; never discard unresolved conflicts silently.

Example: "Get latest on the Pakhsh workspace" → confirm workspace → `tf get` → report results.

## Mode: Check-in

Checklist:

```
- [ ] 1. Setup (connection, RepoName, workfold)
- [ ] 2. Inventory: tf status + folderdiff (checkout does not matter)
- [ ] 3. Filter exclusions; classify different / local-only / server-only
- [ ] 4. Data-safe pend: hash → checkout/add (no overwrite) → re-hash
- [ ] 5. Propose comment + Added/Edited/Deleted grid
- [ ] 6. Wait for explicit approval
- [ ] 7. Check in approved in-scope paths
- [ ] 8. Verify changeset + status + hashes unchanged
```

**2. Inventory** — do both; Git status is not a TFVC inventory:

```bash
tf status . /recursive
tf vc folderdiff . <SERVER_ROOT> /recursive /noprompt /view:different,sourceOnly,targetOnly
```

| folderdiff bucket | Implication |
|-------------------|-------------|
| Different contents | **Edit** candidate even if not checked out |
| Local only | Product files → `tf add` candidate |
| Server only | Pend delete only if intentional |

**3. Exclusions** — ignore `.cursor`, `.git`, `.armin`, `.argent`, `.webui-eval`, `.webui-reviewer`, `.specify`, `agent-logs`, `debug-*.log`, secrets/temp files. Source-NewUI: exclude `Default.aspx`, `login.aspx` (+ `.vb`, `Pages/login.*`) and `nginx/` unless explicitly requested.
**Must include** when different and in scope: `node_modules`, `packages`, `Bin`, `Publish\Output`, `package-lock.json`. Summarize bulk non-code assets separately.

**4. Data-safe pend** — local bytes are the source of truth:
1. SHA-256 hash every candidate.
2. `tf checkout <paths>` / `tf add <paths>` only — **no** `tf get /force` on them.
3. Re-hash; any drift → **stop**, do not check in.

**5. Propose** (required):

```markdown
### Proposed comment
<RepoName>: [1. <CHANGE-1>] [2. <CHANGE-2>]

### Target
- Collection / Server $/path / Workspace / Scope: <RepoName> only

### Data safety
- Pre-pend hashes recorded; post-pend hashes match

### What will happen
| Added | Edited | Deleted |
|-------|--------|---------|
| path or — | path or — | path or — |

Counts: Added N · Edited N · Deleted N · total N

### Also noted (not in this check-in unless you ask)
- Excluded paths / bulk assets: …

Reply **yes** to check in, or change comment / scope.
```

Comment phrases: short purpose, not filenames. Do not run `tf checkin` before the user confirms.

**7. Check in**
- Explicit approved paths whenever any excluded item is pending: `tf checkin <paths> /comment:"…" /noprompt`
- `tf checkin . /recursive /comment:"…" /noprompt` only if everything pending is in scope
- Missing local file still pending edit (`Could not find file`): `tf undo` → `tf get <file> /force` → `tf delete` (that item only), re-propose
- Report the changeset number

**8. Verify** — `tf status . /recursive` shows no in-scope pending; re-hash approved paths (must match pre-pend). Note any intentionally left-out pending items.

## SQL stored procedures

TFS-compliant DPDC / Pakhsh procedures. Output **only** SQL code.

1. Prepend:

```sql
USE [PAKHSH]
GO
```

2. Header:

```text
-- Author: Armin Dashti
-- Date: [YYYY-MM-DD]
-- Reason: [Create/Modify] - [Reason]
```

3. `Pakhsh_Data_New` → `ALTER PROCEDURE`; any other database → `CREATE PROCEDURE`.

## Never

1. Run `tf` commands without confirming the workspace mapping.
2. Check in without the Added | Edited | Deleted grid and explicit approval.
3. `tf get /force` (or overwrite) files you are about to check in, or local edits during Get without approval.
4. Echo `$env:TF_PASSWORD` or paste passwords anywhere.
5. Check in sibling TFS repos in the same run, or use `git commit` for TFVC work.
6. Change `metadata.uuid` on edit.

## Examples

- "Get latest from TFS" → Get mode
- "Check in TFS for Source-NewUI" → Check-in; `RepoName=Source-NewUI`; status + folderdiff; propose; wait for **yes**
- folderdiff shows 11 different files, `tf status` only 2 → hash 11 → checkout 9 → re-hash → propose 11
- Pending includes `login.aspx` not requested → propose product files only; explicit-path check-in
- Hash changed after checkout → stop; report the path; do not check in
