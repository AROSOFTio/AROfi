param(
  [string]$ConfigPath = "$env:LOCALAPPDATA\AROfiVerifier\config.json"
)

$ErrorActionPreference = 'Stop'

function Write-Log {
  param([string]$Message)
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $line = "[$stamp] $Message"
  Add-Content -Path $script:ServiceLog -Value $line
}

function Save-State {
  param(
    [string]$Sha,
    [string]$Status,
    [string]$RunLog = '',
    [string]$Message = ''
  )

  [pscustomobject]@{
    lastAttemptSha = $Sha
    status = $Status
    runLog = $RunLog
    message = $Message
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -Path $script:StatePath -Encoding UTF8
}

if (-not (Test-Path $ConfigPath)) {
  throw "AROFi verifier config not found: $ConfigPath"
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$repoDir = [string]$config.repoDir
$branch = [string]$config.branch
$nodeDir = [string]$config.nodeDir
$pollSeconds = [int]$config.pollSeconds
if ($pollSeconds -lt 30) { $pollSeconds = 60 }

$root = Split-Path -Parent $ConfigPath
$logsDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$script:ServiceLog = Join-Path $logsDir 'service.log'
$script:StatePath = Join-Path $root 'state.json'

$mutex = New-Object System.Threading.Mutex($false, 'Local\AROfiPr54AutoVerifier')
if (-not $mutex.WaitOne(0, $false)) {
  exit 0
}

try {
  Write-Log "Autoverifier started for $branch"

  while ($true) {
    try {
      if (-not (Test-Path (Join-Path $repoDir '.git'))) {
        throw "Verifier repository is missing: $repoDir"
      }
      if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
        throw "Portable Node 20 is missing: $nodeDir"
      }

      $env:PATH = "$nodeDir;$env:PATH"

      & git -C $repoDir fetch --prune origin $branch | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }

      $remoteSha = (& git -C $repoDir rev-parse "origin/$branch").Trim()
      if ($LASTEXITCODE -ne 0 -or -not $remoteSha) { throw 'Unable to resolve remote branch SHA' }

      $state = $null
      if (Test-Path $script:StatePath) {
        try { $state = Get-Content $script:StatePath -Raw | ConvertFrom-Json } catch { $state = $null }
      }

      if ($state -and $state.lastAttemptSha -eq $remoteSha) {
        Start-Sleep -Seconds $pollSeconds
        continue
      }

      $shortSha = $remoteSha.Substring(0, 12)
      $runLog = Join-Path $logsDir "verify-$shortSha.log"
      Save-State -Sha $remoteSha -Status 'running' -RunLog $runLog
      Write-Log "New branch head $shortSha detected; verification starting"

      & git -C $repoDir config core.autocrlf false
      & git -C $repoDir checkout -B $branch "origin/$branch" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Unable to checkout verification branch' }
      & git -C $repoDir reset --hard $remoteSha | Out-Null
      & git -C $repoDir clean -fd | Out-Null
      & git -C $repoDir checkout-index --force --all | Out-Null

      Push-Location $repoDir
      try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\verify_pr54_windows.ps1' *> $runLog
        $verifyExit = $LASTEXITCODE
      }
      finally {
        Pop-Location
      }

      $passed = $false
      if ($verifyExit -eq 0 -and (Test-Path $runLog)) {
        $passed = Select-String -Path $runLog -SimpleMatch 'AROFi FINAL VERIFICATION PASSED' -Quiet
      }

      & git -C $repoDir reset --hard $remoteSha | Out-Null
      & git -C $repoDir clean -fd | Out-Null

      if ($passed) {
        $tag = "pr54-verified-$shortSha"
        & git -C $repoDir tag -f $tag $remoteSha | Out-Null
        & git -C $repoDir push -f origin "refs/tags/$tag" | Out-Null
        $pushOk = $LASTEXITCODE -eq 0
        Save-State -Sha $remoteSha -Status 'passed' -RunLog $runLog -Message $(if ($pushOk) { "Verification tag pushed: $tag" } else { "Verification passed, but tag push failed: $tag" })
        Write-Log "PASS $shortSha; tag push=$pushOk"
      }
      else {
        Save-State -Sha $remoteSha -Status 'failed' -RunLog $runLog -Message 'Build/test verification failed. See run log.'
        Write-Log "FAIL $shortSha; see $runLog"
      }
    }
    catch {
      Write-Log "Verifier loop error: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds $pollSeconds
  }
}
finally {
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}
