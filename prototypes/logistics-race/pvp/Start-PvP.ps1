$ErrorActionPreference = 'Stop'
$pvpRoot = $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 or newer first.' }
if (-not (Test-Path -LiteralPath (Join-Path $pvpRoot 'public/index.html'))) { throw 'Build the PvP package first: npm ci; npm run build' }
if (-not $env:SERVER_KEY_FILE) { $env:SERVER_KEY_FILE = 'C:/NEAR-secrets/server-runtime/dev-20261105124701-22790623478956.testnet.json' }
$env:PUBLIC_ORIGIN = 'http://localhost:4190'
$env:HOST = '127.0.0.1'
$env:PORT = '4190'
$pvpData = Join-Path $pvpRoot 'data'
New-Item -ItemType Directory -Path $pvpData -Force | Out-Null
try { $existing = Invoke-RestMethod -Uri 'http://localhost:4190/healthz' -TimeoutSec 2; if ($existing.network -eq 'testnet') { Write-Output 'Already running: http://localhost:4190/pvp/'; exit 0 } } catch {}
$nodeExecutable = (Get-Command node).Source
$pidFile = Join-Path $pvpData 'server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $savedProcessId = [int](Get-Content -LiteralPath $pidFile -Raw)
    $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedProcessId" -ErrorAction SilentlyContinue
    if ($savedProcess -and $savedProcess.CommandLine.Contains($pvpRoot) -and $savedProcess.CommandLine -match 'server[\\/]main\.mjs') { Write-Output 'Starting or running: http://localhost:4190/pvp/'; exit 0 }
}
$pvpScriptArgument = '"' + (Join-Path $pvpRoot 'server/main.mjs') + '"'
$pvpProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @('--env-file-if-exists=.env',$pvpScriptArgument) -WorkingDirectory $pvpRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $pvpData 'server.log') -RedirectStandardError (Join-Path $pvpData 'server-error.log')
$pvpProcess.Id | Set-Content -LiteralPath (Join-Path $pvpData 'server.pid')
Write-Output 'Starting Testnet PvP. Open http://localhost:4190/pvp/ after the preflight check (about 15 seconds).'
Write-Output 'If it does not open, see data/server-error.log. No private keys are written to these logs.'
