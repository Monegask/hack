$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data/server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No recorded PvP process.'; exit 0 }
$pvpProcessId = [int](Get-Content -LiteralPath $pidFile -Raw)
$pvpProcessInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $pvpProcessId" -ErrorAction SilentlyContinue
if (-not $pvpProcessInfo) { Write-Output 'PvP is already stopped.'; exit 0 }
if (-not $pvpProcessInfo.CommandLine.Contains($PSScriptRoot) -or $pvpProcessInfo.CommandLine -notmatch 'server[\\/]main\.mjs') { throw 'Recorded PID belongs to a different process. Refusing to stop it.' }
Stop-Process -Id $pvpProcessId
Write-Output 'Local PvP stopped. State is retained; a restart can wait up to 15 seconds for the database lease.'
