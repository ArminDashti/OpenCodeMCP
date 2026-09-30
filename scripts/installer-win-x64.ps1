param([string]${local-address}="")
$ErrorActionPreference="Stop"
$AppName="opencode-mcp";$ExeName="opencode-mcp.exe"
$Base=Join-Path $env:LOCALAPPDATA $AppName;$Root=Split-Path -Parent $PSScriptRoot
function Say($m,$c="Yellow"){Write-Host $m -ForegroundColor $c}
function Fail($m){Write-Host "ERROR: $m" -ForegroundColor Red;exit 1}
function IsAdmin{([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
function EnsureAdmin($op){if(-not(IsAdmin)){Say "Elevation required ($op). Restarting as Admin..." "Yellow";$a="-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"";if(${local-address}){$a+=" -local-address `"${local-address}`""};Start-Process powershell -ArgumentList $a -Verb RunAs -Wait;exit $LASTEXITCODE}}
Say "Building $AppName (npm install + build)..." "Yellow"
try{& npm install --prefix $Root 2>&1|Out-Null;if($LASTEXITCODE-ne 0){Fail "npm install failed."}; & npm run build --prefix $Root 2>&1|Out-Null;if($LASTEXITCODE-ne 0){Fail "npm run build (tsc) failed."}}catch{Fail "Build failed: $_"}
foreach($j in @("dist\index.js","dist\cli.js")){if(-not(Test-Path(Join-Path $Root $j))){Fail "Build produced no $j."}}
Say "Build OK: dist\index.js + dist\cli.js" "Green"
Say "Stopping $AppName..." "Yellow"
Get-Process -Name "node" -ErrorAction SilentlyContinue|Where-Object{try{(Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine-match'opencode-mcp|dist.index.js'}catch{$false}}|ForEach-Object{try{Stop-Process -Id $_.Id -Force;Say "Stopped node PID $($_.Id)" "Green"}catch{}}
Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($ExeName)) -ErrorAction SilentlyContinue|ForEach-Object{try{Stop-Process -Id $_.Id -Force;Say "Stopped $($_.Name)" "Green"}catch{}}
New-Item -ItemType Directory -Force -Path $Base|Out-Null
foreach($f in @("Settings.json","Data.db")){$p=Join-Path $Base $f;if(-not(Test-Path $p)){New-Item -ItemType File -Force -Path $p|Out-Null;Say "Created $f" "Green"}}
$DestExe=Join-Path $Base $ExeName;if(Test-Path $DestExe){Remove-Item $DestExe -Force;Say "Removed old $ExeName" "Yellow"}
$SrcExe=Join-Path $Root $ExeName;if(Test-Path $SrcExe){Copy-Item $SrcExe $DestExe -Force;Say "Copied $ExeName" "Green"}
$s=Join-Path $Root "dist";if(Test-Path $s){Copy-Item $s (Join-Path $Base "dist") -Recurse -Force}
foreach($f in @("package.json","package-lock.json")){$x=Join-Path $Root $f;if(Test-Path $x){Copy-Item $x (Join-Path $Base $f) -Force}}
Say "Installing prod deps in $Base..." "Yellow"
try{& npm install --omit=dev --prefix $Base 2>&1|Out-Null;if($LASTEXITCODE-ne 0){Fail "npm install --omit=dev failed."}}catch{Fail "Deps failed: $_"}
Say "Deps OK" "Green"
"@echo off`r`nnode `"%~dp0dist\index.js`" %*"|Set-Content -Encoding Ascii (Join-Path $Base "opencode-mcp.cmd")
"@echo off`r`nnode `"%~dp0dist\cli.js`" %*"|Set-Content -Encoding Ascii (Join-Path $Base "opencodemcp.cmd")
Say "Shims OK" "Green";Say "Deployed to $Base" "Green"
$u=[Environment]::GetEnvironmentVariable("Path","User")
if($u-notlike"*$Base*"){[Environment]::SetEnvironmentVariable("Path","$u;$Base","User");$env:Path+=";$Base";Say "Added to User PATH" "Green"}else{Say "Already in User PATH" "Yellow"}
if($env:Path-notlike"*$Base*"){$env:Path+=";$Base"}
foreach($c in @("opencode-mcp.cmd","opencodemcp.cmd")){if(Test-Path(Join-Path $Base $c)){Say "PATH check: $c present" "Green"}else{Fail "Shim missing: $c"}}
try{$f=(Get-Command opencodemcp -ErrorAction Stop).Source;Say "PATH OK: $f" "Green"}catch{Say "Restart terminal if 'opencodemcp' not found yet." "Yellow"}
if(${local-address}){EnsureAdmin "hosts append";$h="$env:SystemRoot\System32\drivers\etc\hosts";$line="127.0.0.1`t${local-address}";if((Get-Content $h -Raw)-notmatch[regex]::Escape(${local-address})){Add-Content $h "`r`n$line";Say "Hosts: added $line" "Green"}else{Say "Hosts: entry exists" "Yellow"}}
Say "Install complete." "Green"
