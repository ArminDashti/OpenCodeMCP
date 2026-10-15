---
name: github-commit-push
description: >-
  Discovers Git repos under paths in dirs.txt, commits with meaningful messages,
  reconciles newer-wins conflicts, and pushes to main. Uses GitHub MCP only for
  GitHub platform work; stops and tells the human if MCP is unavailable.
  Windows 11; never blocks the full run on one repo.
author: "Armin Dashti"
uuid: 5264a3ba-1035-4f78-85d1-b675530af8b1
---

# Commit Push to GitHub

## When to use

- User asks to commit and push all (or listed) repos, sync the GitHub root up, or put everything on `main`
- Scan roots come from `dirs.txt` in this skill directory (one path per line; `#` comments allowed)
- Exclusions: do not clone missing remotes; do not rewrite git config; do not delete remote or local repos unless asked
- Related: `sync-local-with-remote-in-github` (full bidirectional); `github-pull-all` (pull-only; same MCP-only auth)

## Objective

1. Use **`user-github` MCP only** for GitHub platform work; if MCP is unavailable or cannot complete a required step, **stop and tell the human** — no token, `gh`, or REST fallback
2. Discover every `.git` repo under roots listed in `dirs.txt` (max depth 5; skip `node_modules`, `.venv`, `dist`, `build`, etc.)
3. Ensure `.gitignore` (always `*.exe` and files > 5 MB) and `.gitkeep` in empty leaf folders before commit
4. Commit with meaningful subject/body; push each tip on `main`
5. Auto-resolve simple conflicts (newer `%ct` wins); ask the user on critical conflicts
6. Never stop the full run for one repo — report `failed` and `needs_user` at the end

## Workflow

### Step 0: Auth — GitHub MCP only

1. Call `GetDynamicTools` for `user-github` before first GitHub use
2. **Required:** `user-github` for remote checks, `create_repository`, branch/commit reads, rename resolution, and any GitHub API step
3. On `needsAuth`, 401, or 403: call `mcp_auth` on `user-github`, then retry **once**
4. If MCP is still unavailable, returns an error, or lacks a tool needed for the current step → **stop the run immediately** and tell the human:
   - what failed (namespace state, HTTP code, or missing tool)
   - that this skill uses **GitHub MCP only** — no env-token or `gh` fallback
   - what to fix (connect/authenticate GitHub MCP in Cursor, then rerun)
5. **Never** use `$env:GITHUB_TOKEN`, `$env:GH_TOKEN`, `GITHUB_TOKEN_PAT`, `gh`, REST bearer tokens, or `scripts/set-git-noninteractive-auth.ps1`
6. Local `git` CLI (status, diff, commit, fetch, push) may still run via PowerShell for filesystem work; do **not** inject tokens or open credential UI — if HTTPS git auth fails, mark the repo `failed` and continue others
7. Prefer `user-windows-mcp` → `PowerShell` for local git; keep all repos in **one** session; batch when possible (timeout 120–600s per repo)
8. **Never** fall back to interactive Git Credential Manager

### Step 1: Load roots and discover repos

1. Read `dirs.txt` next to this `SKILL.md` (ignore blank lines and `#` comments)
2. Under each root, find folders that contain `.git` (max depth 5)
3. Skip scan dirs: `node_modules`, `.cache`, `.npm`, `.yarn`, `vendor`, `__pycache__`, `.venv`, `venv`, `.tox`, `dist`, `build`
4. Optional: verify via `user-github` → `list_branches` / `list_commits` for `ArminDashti/<repo>`; flag 404 remotes

```powershell
Get-ChildItem -Path $root -Directory -Recurse -Depth 5 |
  Where-Object { Test-Path (Join-Path $_.FullName ".git") }
```

### Step 2: Normalize to `main`

1. Finish mid-rebase/merge with Step 5, or abort only if corrupt
2. `git checkout main` (detached HEAD → checkout `main`)
3. Stashes: drop if older/redundant vs HEAD; else apply and resolve with Step 5

### Step 3: Hygiene before commit

| Rule | Action |
|------|--------|
| No `.gitignore` | Create with `*.exe` and an auto-managed large-file section |
| `*.exe` | Always ignored; untrack if already tracked |
| Files > 5 MB | Add to auto ignore section; never stage |
| Empty leaf folder | Create `.gitkeep` (UTF-8, CRLF on Win 11) |
| `core.autocrlf` | Prefer `true` on Windows 11 |

### Step 4: Secret scan

Reject paths matching (case-insensitive): `.env`, `.pem`, `credentials`, `id_rsa`, `secrets.json`, `token.json`, obvious password/secret names. Skip those files or the repo; continue others.

### Step 5: Commit with meaningful messages

**Never** use placeholders: `update`, `changes`, `wip`, `misc`, `fix`, `fixes`.

```powershell
Set-Location $repo
git status --short
git diff --stat
git diff
git log -5 --oneline
git add -A
# unstage ignored/exe/oversized
git commit -m $msg
```

| Bad | Good |
|-----|------|
| `update` | `Add armin-session and accept-reject-human-prompt Cursor skills` |
| `fix` | `Fix VPN egress script CIDR refresh for SoftEther` |

- Draft subject/body from status/diff (why + what)
- Conventional Commits only if that repo’s log already uses them
- Never `--no-verify` unless asked

### Step 6: Reconcile with remote (newer wins)

Always `git fetch origin`.

#### 6a. Tip timestamps

```powershell
$localTs  = [long](git log -1 --format=%ct HEAD)
$remoteTs = [long](git log -1 --format=%ct "origin/main")
```

| Case | Action |
|------|--------|
| Behind only | Fast-forward pull |
| Ahead only | Push (Step 7) |
| Diverged, local tip newer | Rebase/merge; resolve 6b; push; `--force-with-lease` only if rewrite still required |
| Diverged, remote tip newer | Rebase/merge; 6b keeps remote when remote file newer; then push |
| Equal tips | Prefer more unique commits; else prefer remote |

#### 6b. Per-file conflicts

| Comparison | Keep |
|------------|------|
| Local newer (`%ct`) | `--ours` |
| Remote newer | `--theirs` |
| Equal | Prefer remote |

**Critical** (ask user — do not auto-resolve): binary; > 3 conflicted files; patterns `*.sln`, `*.csproj`, `package.json`, lockfiles, `web.config`, `app.config`, `*.sql`. Abort rebase/merge; record in `needs_user`; ask keep local / keep remote / skip.

### Step 7: Push / remotes

`git push -u origin main`. Publish **`main` only**.

| Situation | Action |
|-----------|--------|
| OK / new upstream | Normal push |
| Non-FF after reconcile | Re-run Step 6; `--force-with-lease` only if local tip newer |
| Foreign `origin` (403) | `user-github` → `create_repository`; retarget `origin`, keep `upstream`; push — if MCP cannot create, mark `failed` and tell the human |
| No `origin` | Create repo then set `origin`, or mark `missing_remote` |

### Step 8: Final report

| State | Meaning |
|-------|---------|
| `committed_pushed` | Commit + push OK — include subject |
| `pushed` / `up_to_date` | As named |
| `reconciled_local_newer` / `reconciled_remote_newer` | Newer side kept |
| `force_pushed` | Local-newer rewrite |
| `blocked_secrets` / `needs_user` / `failed` / `SKIP` | As named |

Relay failed and needs-user lists to the user.

## Safety rules

1. **Always** use GitHub MCP (`user-github`) only for GitHub platform work; if MCP cannot run, **stop and tell the human** — no token or `gh` fallback.
2. **Never** use `$env:GITHUB_TOKEN`, `$env:GH_TOKEN`, `gh`, REST bearer auth, or `set-git-noninteractive-auth.ps1`.
3. **Always** resolve non-critical conflicts by newer `%ct`; ties prefer remote.
4. **Never** auto-resolve critical conflicts — always ask the user.
5. **Always** publish to `main` when this skill runs.
6. **Never** commit secret-looking files, `*.exe`, or files over 5 MB without explicit override.
7. **Never** use placeholder commit messages (`update`, `wip`, `fix`, `changes`, etc.).
8. **Never** force-push unless newer-wins reconcile requires it (prefer `--force-with-lease`).
9. **Never** update git config or skip hooks unless asked.
10. **Always** continue after a single-repo failure / `needs_user`.
11. **Never** delete a GitHub repo or local folder unless the user explicitly asks.
12. **Always** write skill-managed text files as UTF-8 CRLF on Windows 11.
13. **Never** allow Git Credential Manager (or any git credential UI) to open during a multi-repo run; per-repo HTTPS auth failure → `failed`, not a dialog.

## Examples

**Example 1:** MCP works

- Input: "Commit and push all repos"
- Output: Roots from `dirs.txt`; `user-github` for API; Windows MCP PowerShell for git; meaningful subjects; summary table

**Example 2:** MCP unavailable

- Input: Same ask; `user-github` is `needsAuth`, errors, or auth fails after `mcp_auth`
- Output: Stops immediately; tells the human GitHub MCP is required, names the failure, asks them to fix MCP auth and rerun — does **not** use env tokens or `gh`

**Example 3:** Critical conflict

- Input: Diverged repo with conflicted `package.json`
- Output: Abort auto-resolve; list under `needs_user`; ask keep local / keep remote / skip; continue other repos
