---
name: dpdc-ssrs
description: >-
  DPDC PakhshReports SSRS reports: build and deploy to local SSRS, and fix
  rsInvalidDataSourceCredentialSetting by applying stored SQL credentials on
  DataSourcePakhsh. Use when building .rdl files, running deploy.ps1,
  publishing to localhost/ReportServer, setting up local SSRS, syncing .rdl to
  SQL TFVC, or when ViewRerport.aspx fails with data source credential errors.
disable-model-invocation: false
metadata:
  version: 2.0.0
  author: "Armin Dashti"
  category: database
  tags: [dpdc, pakhsh, ssrs, reporting-services, rdl, deploy, build, credentials, datasource]
  last_updated: "2026-10-09 22:17:56"
  uuid: 1757784e-a64c-4e19-86ca-ba305fe8510f
---

# DPDC SSRS — build, deploy, and data source credentials (local SSRS)

Merges former: `build-and-deploy-ssrs`, `build-deploy-ssrs`, `armin-build-deploy-ssrs`.

## What agents must do

When the user changes reports or cannot view reports locally:

1. **Use local SSRS only** — `http://localhost/ReportServer`, configuration `DebugLocal`.
2. **Build then deploy** — run repo scripts; do not only describe steps.
3. **Apply stored SQL credentials** after deploy (or when `rsInvalidDataSourceCredentialSetting` appears).
4. **Verify** service status, catalog item, and `CredentialRetrieval: Store` before asking the user to retest the web app.
5. **Mirror `.rdl` to SQL TFVC** — run `.\sync-rdl-to-sql.ps1` so every report also exists in `C:\Users\a.dashti\TFS\SQL\03.Stored Procedures\`.
6. **Do not commit or paste passwords** — use `PAKHSH_SSRS_SQL_PASSWORD` or pass `-SqlPassword` at runtime. DB login details live in `.cursor/rules/rules.md`.

For PDF/CSV export after deploy, use `.cursor/skills/export-ssrs-report/SKILL.md`.

## Project layout

| Item | Path |
|------|------|
| Repo root | `PakhshReports/` (this repo) |
| SSRS project | `PakhshReports/PakhshReports.rptproj` |
| Solution | `PakhshReports.sln` |
| Shared data source | `PakhshReports/DataSourcePakhsh.rds` |
| Build script | `build.ps1` |
| Deploy script | `deploy.ps1` |
| Credential script | `set-datasource-credentials.ps1` |
| SQL mirror script | `sync-rdl-to-sql.ps1` |
| SQL TFVC mirror path | `C:\Users\a.dashti\TFS\SQL\03.Stored Procedures\` |
| Local Report Server | `http://localhost/ReportServer` |
| Report Manager | `http://localhost/Reports` |
| Catalog report folder | `/PakhshReports` |
| Catalog data source | `/Data Sources/DataSourcePakhsh` |
| Web app report viewer | `http://localhost:3020/Pages/ViewRerport.aspx` |
| Remote SQL (via RDS) | `10.10.12.52` / `Pakhsh_Data_New` (connection/safety: `dpdc-db-policy`) |

**Configurations in `PakhshReports.rptproj`:**

| Configuration | Report Server | When to use |
|---------------|---------------|-------------|
| `DebugLocal` | `http://localhost/ReportServer` (script default) | Local dev and web app testing |
| `Debug` | `http://10.20.9.59/ReportServer` | Remote deploy **only if user explicitly asks** |
| `Release` | No URL in project | Release output path only |

## Prerequisites

```powershell
Get-Service SQLServerReportingServices | Select-Object Status, Name
```

- Status must be **Running**.
- `http://localhost/ReportServer` must respond (401 is OK; connection refused is not).
- Run scripts from the **repo root** (`D:\repos\PakhshReports` or equivalent clone path).
- Scripts auto-relaunch in Windows PowerShell 5.1 when invoked from PowerShell 7.

## Standard workflow

Copy this checklist and complete each step:

```
Task Progress:
- [ ] Confirm SQLServerReportingServices is Running
- [ ] Build (DebugLocal)
- [ ] Deploy to localhost (DebugLocal)
- [ ] Apply stored credentials on DataSourcePakhsh
- [ ] Verify CredentialRetrieval = Store
- [ ] Sync .rdl files to SQL TFVC (`.\sync-rdl-to-sql.ps1`)
- [ ] User retests ViewRerport.aspx or export
```

### 1. Build

```powershell
.\build.ps1 -BuildConfiguration DebugLocal
```

- Tries Visual Studio (`devenv.com`) + SSDT first.
- If SSDT is missing, **falls back to copying** `.rdl` and `.rds` files to `PakhshReports/bin/DebugLocal/`.
- Alternative (Developer Command Prompt): `devenv PakhshReports.sln /Build DebugLocal`

Build only (no deploy):

```powershell
.\build.ps1 -BuildConfiguration DebugLocal
# or rebuild:
.\build.ps1 -BuildConfiguration DebugLocal  # then manually delete bin\DebugLocal if needed
```

### 2. Deploy

Full project (build + data source + all reports):

```powershell
$env:PAKHSH_SSRS_SQL_PASSWORD = '<password from rules.md>'
.\deploy.ps1
```

Equivalent explicit form:

```powershell
.\deploy.ps1 -Configuration DebugLocal -ReportServerUri http://localhost/ReportServer
```

Single report (after editing one `.rdl`):

```powershell
.\deploy.ps1 -Report Sales_KharidMoshtarianNesbatBeKol_Kala -SkipBuild
```

Useful flags:

| Flag | Purpose |
|------|---------|
| `-SkipBuild` | Deploy existing `bin/` artifacts without rebuilding |
| `-SkipDataSource` | Publish reports only; do not overwrite shared data source |
| `-Report <name>` | Deploy one or more reports (name without or with `.rdl`) |

**Do not** use `-Configuration Debug` or remote `-ReportServerUri` unless the user explicitly requests remote deployment.

### 3. Apply stored SQL credentials (required for local viewing)

#### Why this is needed

Reports reference shared data source `DataSourcePakhsh`. The `.rds` file has a connect string **without** SQL username/password. `deploy.ps1` publishes it with `CredentialRetrieval = None`. Local SSRS has no unattended execution account, so rendering fails with:

`rsInvalidDataSourceCredentialSetting`

**Fix (Option A — stored credentials):** save the Pakhsh SQL login on the Report Server catalog item.

```powershell
$env:PAKHSH_SSRS_SQL_PASSWORD = '<password from rules.md>'
.\set-datasource-credentials.ps1
```

Or pass parameters explicitly (avoid echoing password in logs when possible):

```powershell
.\set-datasource-credentials.ps1 -SqlUserName '<sql-user>' -SqlPassword '<password>'
```

Optional overrides:

| Parameter | Default |
|-----------|---------|
| `-ReportServerUri` | `http://localhost/ReportServer` |
| `-DataSourcePath` | `/Data Sources/DataSourcePakhsh` |
| `-SqlUserName` | `PAKHSH_SSRS_SQL_USER` env var, else the script's built-in default login |
| `-SqlPassword` | `PAKHSH_SSRS_SQL_PASSWORD` env var (required) |

**After every deploy** that republishes the data source (`deploy.ps1` without `-SkipDataSource`), credentials are reset to `None`. Either:

- Set `PAKHSH_SSRS_SQL_PASSWORD` before deploy (deploy re-applies credentials automatically on `DebugLocal`), **or**
- Run `set-datasource-credentials.ps1` again after deploy.

Manual alternative: Report Manager → **Data Sources** → **DataSourcePakhsh** → **Manage** → **Credentials** → **Using the following credentials**.

### 4. Verify

**Data source credentials:**

```powershell
$base = 'http://localhost/ReportServer/'
$svc = (New-Object System.Uri((New-Object System.Uri($base)), 'ReportService2010.asmx')).AbsoluteUri
$proxy = New-WebServiceProxy -Uri $svc -UseDefaultCredential
$ds = $proxy.GetDataSourceContents('/Data Sources/DataSourcePakhsh')
$ds.CredentialRetrieval   # expect: Store
$ds.UserName              # expect: the Pakhsh SQL login (PAKHSH_SSRS_SQL_USER)
$ds.ConnectString         # expect: 10.10.12.52 / Pakhsh_Data_New
```

**Catalog item exists:**

```powershell
$proxy.GetItemDefinition('/PakhshReports/<ReportName>').Length  # expect: > 0
```

**Web app:** open `ViewRerport.aspx` with `ReportPath=/PakhshReports/<ReportName>` on `http://localhost:3020`. The page calls `ServerReport.Refresh()`; it does not pass SQL credentials — SSRS must already have stored credentials on `DataSourcePakhsh`.

## End-to-end example

Deploy one changed report and restore credentials:

```powershell
cd D:\repos\PakhshReports

Get-Service SQLServerReportingServices | Select-Object Status, Name

$env:PAKHSH_SSRS_SQL_PASSWORD = '<password from rules.md>'

.\build.ps1 -BuildConfiguration DebugLocal
.\deploy.ps1 -Report Sales_KharidMoshtarianNesbatBeKol_Kala
# deploy.ps1 re-applies credentials when PAKHSH_SSRS_SQL_PASSWORD is set on DebugLocal
```

If deploy used `-SkipDataSource` or env var was unset:

```powershell
.\set-datasource-credentials.ps1
```

## Troubleshooting

| Symptom | Cause | Action |
|---------|-------|--------|
| `rsInvalidDataSourceCredentialSetting` | `DataSourcePakhsh` has `CredentialRetrieval: None` and no unattended account | Run `set-datasource-credentials.ps1` |
| Error returns after deploy | Deploy republished RDS as `None` | Set `PAKHSH_SSRS_SQL_PASSWORD` before deploy, or rerun credential script |
| Item not found / report missing | Catalog stale | `.\deploy.ps1 -Report <name>` |
| Connection refused to localhost | SSRS service stopped | Start `SQLServerReportingServices` |
| Build copies files instead of SSDT build | SSDT not installed | Expected; copy fallback is valid for deploy |
| Web app error at line 37 in `ViewRerport.aspx.vb` | SSRS error wrapped in Persian message | Fix SSRS/catalog/credentials; app code is not the root cause |
| `verify-deploy.ps1` failures | Script targets remote `10.20.9.59` | Use this skill's local workflow instead |

## Do not

- Deploy to `10.20.9.59` or use `-Configuration Debug` unless the user explicitly asks.
- Store passwords in `.rds`, skills, commits, or chat output.
- Rely on the web app's `Web.config` SQL connection for SSRS — Report Server uses its **own** credential store on `DataSourcePakhsh`.
- Use `ViewReportOnNewServer.aspx` for local testing (points at a remote server).
- Skip credential setup after publishing `DataSourcePakhsh` locally.

## Related skills and rules

- Export/render: `.cursor/skills/export-ssrs-report/SKILL.md`
- Local SSRS policy: `.cursor/rules/ssrs-local-machine.mdc`
- SQL connection info: `.cursor/rules/rules.md`
- DPDC / Pakhsh DB connection (env vars only) and safety rules: [`../dpdc-db-policy/SKILL.md`](../dpdc-db-policy/SKILL.md)
