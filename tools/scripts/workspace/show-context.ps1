[CmdletBinding()]
param(
  [string]$BaseRef
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) {
  throw 'Run this command inside the ACME LOS Git repository.'
}

Push-Location $repositoryRoot.Trim()
try {
  $resolvedBase = $BaseRef
  if ([string]::IsNullOrWhiteSpace($resolvedBase)) {
    foreach ($candidate in @('origin/main', 'main')) {
      & git rev-parse --verify --quiet "$candidate^{commit}" *> $null
      if ($LASTEXITCODE -eq 0) {
        $resolvedBase = $candidate
        break
      }
    }
  }
  if ([string]::IsNullOrWhiteSpace($resolvedBase)) {
    throw 'Could not resolve a base ref. Pass -BaseRef explicitly.'
  }

  $mergeBase = (& git merge-base $resolvedBase HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($mergeBase)) {
    throw "Could not calculate a merge base for '$resolvedBase'."
  }

  $changed = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $pathSets = @(
    @(& git diff --name-only --relative "$mergeBase...HEAD" --),
    @(& git diff --name-only --relative --),
    @(& git diff --cached --name-only --relative --),
    @(& git ls-files --others --exclude-standard)
  )
  foreach ($pathSet in $pathSets) {
    foreach ($path in $pathSet) {
      if (-not [string]::IsNullOrWhiteSpace($path)) {
        $null = $changed.Add($path.Trim().Replace('\', '/'))
      }
    }
  }

  $ownerDocuments = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $checks = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $null = $ownerDocuments.Add('AGENTS.md')

  foreach ($path in $changed) {
    if ($path -match '^apps/web-app/') {
      $null = $ownerDocuments.Add('apps/web-app/AGENTS.md')
      $null = $checks.Add('npx.cmd nx run web-app:lint')
      $null = $checks.Add('npx.cmd nx run web-app:test')
    }
    if ($path -match '^(apps/web-app/src/(app/(?!api/)|components/)|libs/ui/web/|docs/architecture/visual-design-system\.md)') {
      $null = $ownerDocuments.Add('docs/architecture/visual-design-system.md')
      $null = $checks.Add('npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache')
    }
    if ($path -match '^(apps/mobile-app/|libs/ui/mobile/|libs/auth/mobile/)') {
      $null = $ownerDocuments.Add('docs/architecture/current-platform.md')
      $null = $checks.Add('npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream')
    }
    if ($path -match '^(apps/bff-api/|libs/api/|libs/auth/|apps/web-app/src/app/api/)') {
      $null = $ownerDocuments.Add('docs/architecture/auth-and-api-contracts.md')
      $null = $ownerDocuments.Add('docs/architecture/web-server-client-boundaries.md')
    }
    if ($path -match '^(infra/okta/|tools/scripts/okta/|apps/web-app/src/app/account/|apps/web-app/src/components/web/(customer-idx-auth-page|account-security)|apps/bff-api/.*/(Auth|AccountSecurity)/)') {
      $null = $ownerDocuments.Add('infra/okta/README.md')
      $null = $ownerDocuments.Add('docs/operations/okta-account-security-and-profile-sync.md')
      $null = $checks.Add('npm.cmd run okta:bootstrap -- dev --dry-run')
    }
    if ($path -match '^(infra/azure/|tools/scripts/azure/|\.github/workflows/deploy-)') {
      $null = $ownerDocuments.Add('docs/operations/azure-platform-plan.md')
      $null = $ownerDocuments.Add('docs/operations/azure-bootstrap-and-teardown.md')
      $null = $checks.Add('compile every changed Bicep entrypoint with az bicep build')
    }
    if ($path -match '^(infra/analytics/|apps/web-app/src/components/web/analytics/|docs/.*/.*analytics)') {
      $null = $ownerDocuments.Add('infra/analytics/README.md')
      $null = $checks.Add('npm.cmd run analytics:render -- dev')
    }
    if ($path -match '^(\.github/|\.husky/|commitlint\.config\.|docs/operations/release-and-delivery\.md)') {
      $null = $ownerDocuments.Add('docs/operations/release-and-delivery.md')
      $null = $ownerDocuments.Add('docs/architecture/change-safety-workflow.md')
    }
    if ($path -match '^(AGENTS\.md|CLAUDE\.md|apps/.*/AGENTS\.md|apps/.*/CLAUDE\.md|\.agents/|\.claude/|\.codex/|tools/scripts/(workspace|agents)/|docs/architecture/agent-harness\.md)') {
      $null = $ownerDocuments.Add('docs/architecture/agent-harness.md')
      $null = $ownerDocuments.Add('docs/architecture/change-safety-workflow.md')
      $null = $checks.Add('npm.cmd run agents:verify')
    }
  }

  if ($changed.Count -eq 0) {
    $null = $ownerDocuments.Add('README.md')
    $null = $ownerDocuments.Add('docs/architecture/current-platform.md')
  } else {
    $null = $checks.Add('npx.cmd prettier --check .')
  }

  $branch = (& git branch --show-current).Trim()
  Write-Output 'ACME LOS HARNESS CONTEXT'
  Write-Output "branch: $branch"
  Write-Output "base: $resolvedBase"
  Write-Output "merge-base: $mergeBase"
  Write-Output "changed-files: $($changed.Count)"
  foreach ($path in @($changed | Sort-Object)) {
    Write-Output "  $path"
  }
  Write-Output 'read-next:'
  foreach ($path in @($ownerDocuments | Sort-Object)) {
    Write-Output "  $path"
  }
  Write-Output 'suggested-checks:'
  if ($checks.Count -eq 0) {
    Write-Output '  none until a change is selected'
  } else {
    foreach ($check in @($checks | Sort-Object)) {
      Write-Output "  $check"
    }
    Write-Output '  use the verification-loop full gate before promotion'
  }
} finally {
  Pop-Location
}
