---
name: github-pull-all-repos
description: >-
  Pulls the latest commits for every local Git repo under C:/Users/armin/GitHub
  and for C:/Users/armin/.cursor from GitHub using GitHub MCP only. Stops and
  tells the human if MCP is unavailable. Detects GitHub renames whose local
  folder or origin URL still use the old name, updates origin, and renames the
  local folder when safe.
author: "Armin Dashti"
uuid: b6041699-d984-426c-8e67-bdf465c06f3d
---

# GitHub Pull Local Repos

## When to use

- User asks to pull latest repos, update local clones from GitHub, sync down only, or refresh projects without committing or pushing
- **Always** pull both fixed roots (never `Documents/GitHub`):
  - `C:/Users/armin/GitHub` — each direct child folder that contains `.git`
  - `C:/Users/armin/.cursor` — the folder itself is one repo (`ArminDashti/.cursor`)
- Exclusions: no commit, no push, no clone of missing remotes (except reconnecting `.cursor` when `.git` is missing — see Step 1), no full bidirectional sync
- Related: `commit-push-to-github` (commit + push; same MCP-only auth)

## Objective

1. Use **`user-github` MCP only** for GitHub platform work; if MCP is unavailable or cannot complete a required step, **stop and tell the human** — no token, `gh`, or REST fallback
2. Discover every Git repo under both fixed roots
3. Resolve GitHub renames when the remote was renamed but the local folder and/or `origin` URL still use the old name
4. Fast-forward each repo to match `origin/<current-branch>`
5. Preserve local uncommitted work via stash when a dirty tree blocks pull
6. Report pulled / up-to-date / renamed / blocked / missing-remote clearly (grouped by root)

## Workflow

### Step 1: Discover local repos

**Root A — project clones**

```powershell
Get-ChildItem -Path "C:\Users\armin\GitHub" -Directory |
  Where-Object { Test-Path (Join-Path $_.FullName ".git") } |
  ForEach-Object { $_.FullName }
```

**Root B — Cursor config repo**

- Target: `C:\Users\armin\.cursor` (single repo, not child discovery)
- Expected remote: `https://github.com/ArminDashti/.cursor.git`
- If `.git` is missing: reconnect without wiping the folder — `git clone --no-checkout` into a temp dir, move only the temp `.git` into `C:\Users\armin\.cursor`, then `git fetch` and set the current branch to track `origin/main` (or `origin/HEAD`); then continue with the normal pull steps
- Never treat `C:\Users\armin` (home) as the repo even if a parent `.git` exists

Record for each: root, folder name, current branch, `git remote get-url origin`.

### Step 2: Auth — GitHub MCP only

1. Call `GetDynamicTools` for `user-github` before first GitHub API use
2. **Required:** `user-github` for remote checks (`list_branches`, `list_commits`, rename resolution, repo lookup, etc.)
3. On `needsAuth`, 401, or 403: call `mcp_auth` on `user-github`, then retry **once**
4. If MCP is still unavailable, returns an error, or lacks a tool needed for the current step → **stop the run immediately** and tell the human:
   - what failed (namespace state, HTTP code, or missing tool)
   - that this skill uses **GitHub MCP only** — no env-token or `gh` fallback
   - what to fix (connect/authenticate GitHub MCP in Cursor, then rerun)
5. **Never** use `$env:GITHUB_TOKEN`, `$env:GH_TOKEN`, `GITHUB_TOKEN_PAT`, `gh`, REST bearer tokens, or `scripts/set-git-noninteractive-auth.ps1`
6. Local `git` CLI (fetch, pull, remote set-url) may still run via PowerShell for filesystem work; do **not** inject tokens or open credential UI — if HTTPS git auth fails, mark the repo `failed` or `missing_remote` and continue others
7. Prefer `user-windows-mcp` → `PowerShell` (timeout 300–600s) and keep all repos in **one** session
8. After Step 2b (rename resolve), skip or flag repos whose remote still returns 404 / not found
9. **Never** fall back to interactive Git Credential Manager

### Step 2b: Resolve GitHub rename (remote renamed, local not)

Run this **before** fetch/pull for every discovered repo. Covers: GitHub renamed the repo; local folder name and/or `origin` URL still use the old name.

**Detect**

1. Parse `origin` → `owner` + `repo` (strip `.git`; support `https://github.com/...` and `git@github.com:...`)
2. Resolve the **current** GitHub identity via **`user-github` MCP only**:
   - Prefer API lookup of `owner/repo` from the local origin (GitHub follows rename redirects and returns the live repo)
   - Read the live `full_name` / `name` (and `html_url` / `clone_url` when available)
3. Also treat as a rename candidate when `git fetch origin` fails with 404 / “repository not found”, then retry the same API resolve using the old `owner/repo` from origin (and, if needed, match by repo id if the tool exposes it)
4. Compare:
   - Origin path `owner/repo` vs live `full_name`
   - For Root A only: local folder name vs live `name`
5. No mismatch → continue to Step 3 unchanged

**Apply when renamed**

1. **Update `origin` URL** to the live clone URL, keeping the same scheme as before (HTTPS stays HTTPS; SSH stays SSH). Example: `git remote set-url origin https://github.com/<owner>/<new-name>.git`
2. **Root A — rename local folder** when folder name ≠ live `name`:
   - Destination: `C:/Users/armin/GitHub/<new-name>`
   - If destination already exists → do **not** overwrite; keep the current folder; mark `blocked_folder_rename`; still keep the updated `origin` URL; continue pull from the old folder path
   - If destination is free → `Rename-Item` the folder to `<new-name>`; use the new path for all later steps
3. **Root B (`.cursor`)** — update `origin` only; **never** rename the `C:/Users/armin/.cursor` folder
4. Record `remote_renamed` (and `folder_renamed` when the folder moved), then continue with fetch/pull on the resolved path
5. Do **not** mark `missing_remote` solely because the old name 404s if the live rename was resolved and `origin` was updated

### Step 3: Pull via PowerShell

Prefer `user-windows-mcp` → `PowerShell` (timeout 300–600s). For each discovered path (all GitHub children, then `.cursor`), using the path after any folder rename from Step 2b:

```powershell
git fetch origin
$branch = git branch --show-current
if (-not $branch) { $branch = "main" }
$local  = (git rev-parse HEAD).Trim()
$remote = (git rev-parse "origin/$branch").Trim()
# if equal → already_up_to_date
# else → git pull --ff-only origin $branch
```

### Step 4: Dirty working tree while behind

If `--ff-only` fails because local changes would be overwritten:

```powershell
git stash push -u -m "auto-stash before pull"
git pull --ff-only origin $branch
git stash pop
```

- After a successful pull, prefer the pulled (remote) version on stash conflicts in files the remote also updated
- Keep purely local-only file edits when they do not conflict
- Drop leftover stash entries after resolving
- If stash pop leaves unsafe conflicts → stop on that repo, continue others

### Step 5: Final status and report

| State | Meaning |
|-------|---------|
| `pulled` | Fast-forward applied |
| `already_up_to_date` | Local HEAD == `origin/<branch>` |
| `ahead` | Local has commits not on remote |
| `remote_renamed` | `origin` URL updated to match a GitHub rename (may combine with pull states) |
| `folder_renamed` | Local folder under `C:/Users/armin/GitHub` renamed to the live GitHub name |
| `blocked_folder_rename` | Live GitHub name already exists as another folder; `origin` updated, folder left as-is |
| `blocked_dirty` | Pull still blocked after stash attempt |
| `missing_remote` | Fetch/API 404 or auth failure for origin **after** rename resolve failed or found nothing |
| `failed` | Other git error |

Report both roots, total repos, renamed (old → new name / URL), pulled (with SHA range if known), already current, problems — grouped by root.

## Safety rules

1. **Always** pull both `C:/Users/armin/GitHub` (child repos) and `C:/Users/armin/.cursor` (the folder itself); never use `C:/Users/armin/Documents/GitHub` as a default root.
2. **Always** use GitHub MCP (`user-github`) only for GitHub platform work; if MCP cannot run, **stop and tell the human** — no token or `gh` fallback.
3. **Always** run Step 2b rename resolve before treating a 404 as `missing_remote`.
4. **Never** use `$env:GITHUB_TOKEN`, `$env:GH_TOKEN`, `gh`, REST bearer auth, or `set-git-noninteractive-auth.ps1`.
5. **Never** commit or push as part of this skill unless the user explicitly asks.
6. **Never** `git reset --hard` or discard local changes without explicit user approval (reconnect of a missing `.cursor` `.git` may check out the tracked branch after attaching `.git` only).
7. **Never** force-push or rewrite history.
8. **Always** use `--ff-only` first; only stash+retry when dirty trees block an otherwise fast-forwardable pull.
9. **Always** continue to the next repo after a single-repo failure.
10. **Never** delete a local repo folder unless the user explicitly asks.
11. **Never** overwrite an existing destination folder when renaming for a GitHub rename; use `blocked_folder_rename` instead.
12. **Never** rename the `C:/Users/armin/.cursor` directory for a GitHub rename.
13. **Never** allow Git Credential Manager (or any git credential UI) to open during a multi-repo run; per-repo HTTPS auth failure → `failed`, not a dialog.

## Examples

**Example 1:** MCP works

- Input: "Pull all repos" / `/github-pull-all`
- Output: Uses `user-github` for remote checks; pulls every `C:\Users\armin\GitHub\*` clone plus `C:\Users\armin\.cursor`; summary of pulled vs up-to-date per root

**Example 2:** MCP unavailable

- Input: Same ask; `user-github` is `needsAuth`, errors, or auth fails after `mcp_auth`
- Output: Stops immediately; tells the human GitHub MCP is required, names the failure, asks them to fix MCP auth and rerun — does **not** use env tokens or `gh`

**Example 3:** `.cursor` missing `.git`

- Input: `/github-pull-all` on a machine where `.cursor` lost its git metadata
- Output: Reconnects by moving a fresh clone’s `.git` into `C:\Users\armin\.cursor`, then fast-forward pulls `main`

**Example 4:** GitHub renamed, local folder and origin still old

- Local: `C:/Users/armin/GitHub/legacy-api`, `origin` → `https://github.com/ArminDashti/legacy-api.git`
- GitHub live name: `helix-api`
- Output: Sets `origin` to `…/helix-api.git`; renames folder to `helix-api`; pulls; reports `remote_renamed` + `folder_renamed` (plus pull state)

**Example 5:** GitHub renamed, destination folder already exists

- Local: `C:/Users/armin/GitHub/old-name`, live GitHub name `new-name`, but `C:/Users/armin/GitHub/new-name` already exists
- Output: Updates `origin` only; leaves folder as `old-name`; reports `blocked_folder_rename`; still attempts pull from the old path
