$ErrorActionPreference="Stop"
$Dir=Split-Path -Parent $PSScriptRoot;$Base=Join-Path $env:LOCALAPPDATA "opencode-mcp";$TestHost="opencode-mcp-test.local"
$pass=0;$fail=0
function Ok($m,$cond){if($cond){Write-Host "PASS: $m" -ForegroundColor Green;$script:pass++}else{Write-Host "FAIL: $m" -ForegroundColor Red;$script:fail++}}
$Inst=Join-Path $Dir "scripts\installer-win-x64.ps1";$Rem=Join-Path $Dir "scripts\Remove-win-x64.ps1"
& npm run build --prefix $Dir 2>&1|Out-Null
Ok "build creates dist\index.js" (Test-Path(Join-Path $Dir "dist\index.js"))
Ok "build creates dist\cli.js" (Test-Path(Join-Path $Dir "dist\cli.js"))
$CliJs=Join-Path $Dir "dist\cli.js"
Ok "cli help lists service commands" ((& node $CliJs help 2>&1|Out-String)-match"service start")
Ok "cli doctor runs" ((& node $CliJs doctor 2>&1|Out-String)-match"opencode CLI")
Ok "cli api port shows port" ((& node $CliJs api port 2>&1|Out-String)-match"api port:")
Ok "cli webui port shows port" ((& node $CliJs webui port 2>&1|Out-String)-match"webui port:")
Ok "cli update placeholder" ((& node $CliJs update 2>&1|Out-String)-match"placeholder")
Ok "cli remove placeholder" ((& node $CliJs remove 2>&1|Out-String)-match"placeholder")
Ok "cli service status runs" ((& node $CliJs service status 2>&1|Out-String)-match"service:")
$Wp=18090;$j=Start-Job -ScriptBlock{param($d,$p)node(Join-Path $d "dist\cli.js")webui --port $p} -ArgumentList $Dir,$Wp
$ok=$false;for($i=0;$i-lt20;$i++){Start-Sleep -Milliseconds 500;try{$r=Invoke-WebRequest -Uri "http://127.0.0.1:$Wp/api/status" -UseBasicParsing -TimeoutSec 2;if($r.StatusCode-eq200){$ok=$true;break}}catch{}}
Ok "cli webui serves /api/status" $ok
try{Stop-Job $j -ErrorAction SilentlyContinue}catch{};try{Remove-Job $j -Force -ErrorAction SilentlyContinue}catch{}
& powershell -NoProfile -ExecutionPolicy Bypass -File $Inst -local-address $TestHost
Ok "install creates base dir" (Test-Path $Base)
Ok "install creates Settings.json" (Test-Path(Join-Path $Base "Settings.json"))
Ok "install creates Data.db" (Test-Path(Join-Path $Base "Data.db"))
Ok "install deploys dist\index.js" (Test-Path(Join-Path $Base "dist\index.js"))
Ok "install deploys dist\cli.js" (Test-Path(Join-Path $Base "dist\cli.js"))
Ok "install creates opencodemcp.cmd" (Test-Path(Join-Path $Base "opencodemcp.cmd"))
Ok "install updates User PATH" ([Environment]::GetEnvironmentVariable("Path","User")-like"*$Base*")
Ok "install adds hosts entry" ((Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" -Raw)-match[regex]::Escape($TestHost))
& powershell -NoProfile -ExecutionPolicy Bypass -File $Inst -local-address $TestHost
Ok "update keeps base dir" (Test-Path $Base)
Ok "update keeps dist\index.js" (Test-Path(Join-Path $Base "dist\index.js"))
& powershell -NoProfile -ExecutionPolicy Bypass -File $Rem -local-address $TestHost
Ok "remove deletes base dir" (-not(Test-Path $Base))
Ok "remove cleans User PATH" ([Environment]::GetEnvironmentVariable("Path","User")-notlike"*$Base*")
Ok "remove cleans hosts entry" ((Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" -Raw)-notmatch[regex]::Escape($TestHost))
$c="Red";if($fail-eq0){$c="Green"}
Write-Host "`nResult: $pass passed, $fail failed" -ForegroundColor $c
if($fail-eq0){exit 0}else{exit 1}
