param([string]${local-address}="")
$ErrorActionPreference="Stop"
$AppName="opencode-mcp";$ExeName="opencode-mcp.exe";$Base=Join-Path $env:LOCALAPPDATA $AppName
function Say($m,$c="Yellow"){Write-Host $m -ForegroundColor $c}
function IsAdmin{([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)}
function EnsureAdmin($op){if(-not(IsAdmin)){Say "Elevation required ($op). Restarting as Admin..." "Yellow";$a="-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"";if(${local-address}){$a+=" -local-address `"${local-address}`""};Start-Process powershell -ArgumentList $a -Verb RunAs -Wait;exit $LASTEXITCODE}}
Say "Stopping $AppName..." "Yellow"
Get-Process -Name "node" -ErrorAction SilentlyContinue|Where-Object{try{(Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine-match'opencode-mcp|dist.index.js'}catch{$false}}|ForEach-Object{try{Stop-Process -Id $_.Id -Force;Say "Stopped node PID $($_.Id)" "Green"}catch{}}
Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($ExeName)) -ErrorAction SilentlyContinue|ForEach-Object{try{Stop-Process -Id $_.Id -Force;Say "Stopped $($_.Name)" "Green"}catch{}}
if(Test-Path $Base){Remove-Item $Base -Recurse -Force;Say "Deleted $Base" "Green"}else{Say "Base absent (already removed)" "Yellow"}
$u=[Environment]::GetEnvironmentVariable("Path","User")
if($u-like"*$Base*"){$n=($u-split';'|Where-Object{$_-and$_-ne$Base})-join';';[Environment]::SetEnvironmentVariable("Path",$n,"User");Say "Removed from User PATH" "Green"}else{Say "Not in User PATH" "Yellow"}
if(${local-address}){EnsureAdmin "hosts cleanup";$h="$env:SystemRoot\System32\drivers\etc\hosts";(Get-Content $h|Where-Object{$_-notmatch"127\.0\.0\.1\s+$([regex]::Escape(${local-address}))(\s|$)"})|Set-Content $h -Encoding Ascii;Say "Hosts: cleaned ${local-address}" "Green"}else{Say "Hosts: no -local-address given, skipping" "Yellow"}
Say "Remove complete." "Green"
