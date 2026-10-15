# TFS Reference

Environment-agnostic notes for `tf.exe` (TFVC). See [SKILL.md](SKILL.md) for the Get and Check-in workflows.

## Resolve tf.exe

1. `Get-Command tf.exe` (Developer PowerShell)
2. Visual Studio / SSMS install path:

```
<VS Root>\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\TF.exe
```

Common roots: `Microsoft Visual Studio\18\*`, `2022\*`, `2019\*`, and sometimes SSMS Team Explorer.

## Collection URL

Shape: `http(s)://<host>[:port]/tfs/<CollectionName>`

Sources (in order):
1. User request
2. Project docs in the current repo
3. `workfold` / `workspaces` output

The collection URL is **not** the same as a team project path (`$/ProjectName/...`). Use the collection root for `/collection:` switches.

## Workspace and mappings

| Command | Purpose |
|---------|---------|
| `tf workspaces /collection:$collection /owner:*` | List workspaces on a collection |
| `tf workfold` | Show workspace name and local ↔ server mappings for cwd |
| `tf dir "<ServerPath>" /recursive` | List server items under a path |

When cwd is inside a mapped folder, most commands infer workspace automatically.

**Server workspace note:** edits may not appear in `tf status` until `tf checkout`. Always run folderdiff so un-checked-out local edits are not missed.

## Authentication

Default: Windows integrated auth or cached TFS credentials. Avoid `/login` unless required.

## Common tf.exe flags

| Flag | Purpose |
|------|---------|
| `/recursive` | Include subfolders |
| `/comment:"..."` | Check-in comment (required for checkin) |
| `/noprompt` | Non-interactive; fail instead of prompting |
| `/collection:$collection` | Target collection (workspaces, some server queries) |

## folderdiff (local vs server, checkout does not matter)

```powershell
& $tf vc folderdiff . $<SERVER_ROOT> /recursive /noprompt /view:different,sourceOnly,targetOnly
```

| View | Meaning |
|------|---------|
| `different` | Same relative path; contents differ |
| `sourceOnly` | Local only |
| `targetOnly` | Server only |

Parse sections:

- `Items That Exist Only in <local root>`
- `Items That Exist Only in $<SERVER_ROOT>` (header may include a trailing `;T`)
- `Show Items That Have Different Contents`

Write large raw output under `.armin/` only as a temp scratch file, then delete it before finishing the turn.

## Data-safe pend (preserve local bytes)

```powershell
# 1) Hash candidates
Get-FileHash <path> -Algorithm SHA256

# 2) Checkout WITHOUT get/force (keeps local content on server workspaces)
& $tf checkout <paths>

# 3) Re-hash — must match step 1
Get-FileHash <path> -Algorithm SHA256

# 4) After approved check-in, hash again — must still match
```

| Do | Do not |
|----|--------|
| `tf checkout` then check in local edits | `tf get /force` on those same paths before check-in |
| Explicit path check-in when exclusions are pending | Blind `tf checkin .` that would submit excluded login/nginx/tooling |
| Abort on hash drift | Continue and hope the server copy is fine |

## Server vs local paths

- Server paths start with `$/` (example: `$/MyTeamProject/src`)
- Local paths are normal filesystem paths mapped via the workspace
- `workfold` links the two for the current directory

## Must not check in

Always exclude from status proposals, `tf add`, and `tf checkin` (even under cwd):

| Path | Rule |
|------|------|
| `.cursor/` | Ignore entirely |
| `.git/` | Ignore entirely |
| `.armin/` | Ignore entirely |
| `.argent/` | Ignore entirely |
| `.webui-eval/` / `.webui-reviewer/` / `.specify/` / `agent-logs/` | Ignore entirely |
| `debug-*.log` | Ignore |
| Secrets / credentials / scratch temp | Exclude unless user insists |

**Source-NewUI (unless user explicitly includes):** `Default.aspx`, `login.aspx`, their `.vb` counterparts, `Pages/login.*`, and everything under `nginx/`.

Undo pending changes under ignored folders before checking in `.` so they are not submitted — or check in explicit approved paths instead.

## Must include in check-in

Do **not** exclude these from status, `tf add`, or check-in when they are in-scope product/build artifacts:

| Path | Notes |
|------|--------|
| `node_modules` | Anywhere in tree |
| `packages` | NuGet restored packages |
| `Bin` | Build output |
| `Publish\Output` | IIS publish export |
| `package-lock.json` | Node lock file |

## Comment format

```text
<RepoName>: [1. <CHANGE-1>] [2. <CHANGE-2>] [3. <CHANGE-3>]
```

Keep each change phrase short. Derive `RepoName` from the user-named repo or the current prompt project folder.

## Troubleshooting

| Symptom | Action |
|---------|--------|
| "Not mapped" / no workspace | Run `workfold`; cd into a mapped folder or map with `tf workfold` |
| Wrong collection | Confirm collection URL; list workspaces with `/collection:` |
| Check-in blocked by get | Resolve conflicts carefully; do not force-overwrite local edits you intend to submit |
| tf.exe not found | Use Developer PowerShell or install VS/SSMS with Team Explorer |
| Pending under `.cursor` / `.git` / `.armin` | Undo those paths; do not include in check-in |
| `tf status` empty but local ≠ server | Run folderdiff; checkout/add; re-hash; propose |
| Hash changed after checkout | Stop; do not check in; investigate overwrite |
