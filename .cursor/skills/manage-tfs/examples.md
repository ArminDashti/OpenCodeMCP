# TFS Check-in Examples

Placeholders: `$tf`, `$collection`, `<LocalPath>`, `<SERVER_ROOT>`, `<changesetId>`. Resolve them per [SKILL.md](SKILL.md) — do not hardcode environment values.

## Inventory: status + folderdiff

```powershell
Set-Location "<LocalPath>"

& $tf status . /recursive

& $tf vc folderdiff . $<SERVER_ROOT> /recursive /noprompt /view:different,sourceOnly,targetOnly
```

Merge pending changes with **content-different** files even when they are not checked out.

## Data-safe checkout then check-in

```powershell
Set-Location "<LocalPath>"

$files = @("Pages\Example.aspx", "Pages\Example.aspx.vb")
$before = @{}
foreach ($f in $files) { $before[$f] = (Get-FileHash $f -Algorithm SHA256).Hash }

& $tf checkout $files

foreach ($f in $files) {
  if ((Get-FileHash $f -Algorithm SHA256).Hash -ne $before[$f]) {
    throw "Hash drift: $f — abort check-in"
  }
}

# After user approves comment/grid:
& $tf checkin $files /comment:"MyProject: [1. Fix example page layout]" /noprompt

foreach ($f in $files) {
  if ((Get-FileHash $f -Algorithm SHA256).Hash -ne $before[$f]) {
    throw "Hash drift after check-in: $f"
  }
}

& $tf status . /recursive
```

## Current-folder check-in (all pending in-scope)

```powershell
Set-Location "<LocalPath>"

& $tf status . /recursive

& $tf checkin . /recursive /comment:"MyProject: [1. Fix auth timeout] [2. Remove dead helper]" /noprompt
```

Use `.` only when **no** excluded pending files would be submitted. Otherwise pass explicit approved paths.

## With detected adds and deletes

```powershell
Set-Location "<LocalPath>"

& $tf status . /recursive
# Review add / edit / delete; exclude .cursor, .git, .armin, …
& $tf add .\src\NewFeature.cs
# If a pending edit points at a missing file that should leave the server:
# & $tf undo <file> /noprompt; & $tf get <file> /force /noprompt; & $tf delete <file>

& $tf checkin . /recursive /comment:"Billing: [1. Add invoice DTO] [2. Delete unused mapper]" /noprompt
```

## Discovery before first check-in

```powershell
& $tf workspaces /collection:$collection /owner:*
& $tf workfold .
& $tf status . /recursive
& $tf vc folderdiff . $<SERVER_ROOT> /recursive /noprompt /view:different,sourceOnly,targetOnly
```

## Comment format

Required shape:

```text
<RepoName>: [1. <CHANGE-1>] [2. <CHANGE-2>] [3. <CHANGE-3>]
```

| Example | Comment |
|---------|---------|
| One change | `Portal: [1. Fix login layout]` |
| Several short changes | `OrdersApi: [1. Drop legacy endpoint] [2. Update controller] [3. Fix null check]` |
| Prefer purpose over filenames | `Reports: [1. Speed up monthly query]` (not a dump of `.cs` paths) |
