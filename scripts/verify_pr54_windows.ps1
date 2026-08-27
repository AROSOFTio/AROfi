$ErrorActionPreference = 'Stop'

$expectedBranch = 'perf/reduce-dashboard-load-20260826'
$patches = @(
  'apply_iotec_source_patches.py',
  'apply_unified_gateway_patches.py',
  'apply_gateway_webhook_patches.py',
  'hide_pesapal_gateway.py',
  'apply_live_gateway_activation.py',
  'preserve_yo_uganda_gateway.py',
  'apply_voucher_preview_patches.py',
  'apply_voucher_dashboard_patches.py',
  'finalize_voucher_dashboard.py',
  'fix_lucide_icon_compat.py',
  'apply_public_content_patches.py',
  'apply_portal_tv_package_patches_v2.py',
  'apply_router_compensation_review.py',
  'apply_router_compensation_ui.py',
  'fix_support_ticket_workspace.py',
  'apply_router_wan_port_support.py',
  'sanitize_mikrotik_command_output.py',
  'fix_routeros6_7_provisioning.py',
  'apply_mikrotik_background_install.py',
  'enforce_no_idle_bundle_logout.py',
  'fix_router_presence_and_access_lifecycle.py',
  'stabilize_router_status_hysteresis.py',
  'fix_iotec_live_gateway_diagnostics.py',
  'fix_iotec_oauth_compatibility.py',
  'finalize_gateway_compile.py',
  'verify_router_captive_invariants.py',
  'apply_arofi_brand_and_three_plan_patches.py',
  'forbid_mikrotik_auto_mac_auth.py'
)

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path '.\package.json')) {
  throw 'Run this script from the AROFi repository root.'
}

$currentBranch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to determine the current Git branch.'
}
if ($currentBranch -ne $expectedBranch) {
  throw "Wrong branch: '$currentBranch'. Checkout '$expectedBranch' first."
}

$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to inspect the Git working tree.'
}
if ($dirty) {
  throw 'Working tree is not clean. Commit/stash local changes before verification.'
}

Write-Host 'AROFi PR #54 local verification' -ForegroundColor Green
Write-Host "Branch: $currentBranch"
Write-Host "Commit: $((git rev-parse --short HEAD).Trim())"

Invoke-Step 'Node.js check' { node --version }
Invoke-Step 'npm check' { npm --version }

$python = $null
$pythonArgs = @()
if (Get-Command python -ErrorAction SilentlyContinue) {
  $python = 'python'
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $python = 'py'
  $pythonArgs = @('-3')
} else {
  throw 'Python 3 is required but was not found in PATH.'
}

Invoke-Step 'Python check' { & $python @pythonArgs --version }
Invoke-Step 'Install root dependencies' { npm ci }

Write-Host "`n=== Apply guarded production source patches ===" -ForegroundColor Cyan
foreach ($patch in $patches) {
  Write-Host "Running $patch"
  & $python @pythonArgs "scripts/$patch"
  if ($LASTEXITCODE -ne 0) {
    throw "Production source patch failed: $patch"
  }
}

Invoke-Step 'Generate Prisma Client' { npx prisma generate --schema=apps/api/prisma/schema.prisma }
Invoke-Step 'Build all apps' { npx turbo run build --cache-dir=.turbo }
Invoke-Step 'Run tests' { npx turbo run test --cache-dir=.turbo }

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host 'AROFi FINAL VERIFICATION PASSED' -ForegroundColor Green
Write-Host 'BUILD: PASS' -ForegroundColor Green
Write-Host 'TESTS: PASS' -ForegroundColor Green
Write-Host '==========================================' -ForegroundColor Green
Write-Host "Verified commit: $((git rev-parse --short HEAD).Trim())"
