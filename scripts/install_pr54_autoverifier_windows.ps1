$ErrorActionPreference = 'Stop'

$branch = 'perf/reduce-dashboard-load-20260826'
$taskName = 'AROfi PR54 Auto Verify'
$repoRoot = (& git -C (Join-Path $PSScriptRoot '..') rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
  throw 'Run this installer from a checked-out AROFi repository.'
}

$origin = (& git -C $repoRoot remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or -not $origin) {
  throw 'Unable to read the AROFi origin remote.'
}

$root = Join-Path $env:LOCALAPPDATA 'AROfiVerifier'
$repoDir = Join-Path $root 'repo'
$toolsDir = Join-Path $root 'tools'
$nodeDir = Join-Path $toolsDir 'node20'
$configPath = Join-Path $root 'config.json'
$workerPath = Join-Path $root 'pr54_autoverifier_windows.ps1'

New-Item -ItemType Directory -Force -Path $root, $toolsDir | Out-Null

Write-Host 'Preparing isolated AROFi verification checkout...'
if (-not (Test-Path (Join-Path $repoDir '.git'))) {
  & git clone --no-hardlinks $repoRoot $repoDir
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create isolated verifier checkout.' }
}

& git -C $repoDir remote set-url origin $origin
& git -C $repoDir config core.autocrlf false
& git -C $repoDir fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch the PR #54 branch.' }
& git -C $repoDir checkout -B $branch "origin/$branch"
if ($LASTEXITCODE -ne 0) { throw 'Unable to checkout the PR #54 branch.' }
& git -C $repoDir reset --hard "origin/$branch" | Out-Null
& git -C $repoDir clean -fd | Out-Null
& git -C $repoDir checkout-index --force --all | Out-Null

if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
  Write-Host 'Installing portable Node 20 for exact AROFi runtime verification...'
  $shasUrl = 'https://nodejs.org/dist/latest-v20.x/SHASUMS256.txt'
  $shaText = (Invoke-WebRequest -UseBasicParsing -Uri $shasUrl).Content
  $match = [regex]::Match($shaText, '(?m)^([a-fA-F0-9]{64})\s+\*?(node-v20\.[0-9.]+-win-x64\.zip)$')
  if (-not $match.Success) {
    throw 'Unable to resolve the latest portable Node 20 Windows package.'
  }

  $expectedHash = $match.Groups[1].Value.ToUpperInvariant()
  $fileName = $match.Groups[2].Value
  $zipPath = Join-Path $toolsDir $fileName
  $downloadUrl = "https://nodejs.org/dist/latest-v20.x/$fileName"

  Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $zipPath
  $actualHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actualHash -ne $expectedHash) {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    throw 'Portable Node 20 checksum verification failed.'
  }

  $extractDir = Join-Path $toolsDir ([IO.Path]::GetFileNameWithoutExtension($fileName))
  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -Path $zipPath -DestinationPath $toolsDir -Force
  Remove-Item $nodeDir -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item $extractDir $nodeDir
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
}

Copy-Item (Join-Path $PSScriptRoot 'pr54_autoverifier_windows.ps1') $workerPath -Force

[pscustomobject]@{
  repoDir = $repoDir
  branch = $branch
  nodeDir = $nodeDir
  pollSeconds = 60
} | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$actionArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$workerPath`" -ConfigPath `"$configPath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Automatically verifies each new PR #54 branch head on this PC using Node 20, then pushes a verification tag when build and tests pass.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ''
Write-Host 'AROFi automatic verification is installed.' -ForegroundColor Green
Write-Host 'GitHub Desktop is not required.' -ForegroundColor Green
Write-Host "Task: $taskName"
Write-Host "Worker checkout: $repoDir"
Write-Host "Logs: $(Join-Path $root 'logs')"
Write-Host 'Every new PR #54 branch commit will be fetched and verified automatically while you are logged in.'
