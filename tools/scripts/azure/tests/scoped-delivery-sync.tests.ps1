Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$entrypoint = Join-Path $PSScriptRoot '../setup-github-azure-environments.ps1'
$global:deliveryCalls = [Collections.Generic.List[string]]::new()
$global:deliveryAssigned = $false
$global:deliveryMismatch = $false
$global:deliveryClient = '11111111-1111-1111-1111-111111111111'
$global:deliveryScope = '/subscriptions/22222222-2222-2222-2222-222222222222/resourceGroups/rg-acme-hub-monitor-eus-01'
function global:az {
  $cmd = $args -join ' '; $global:deliveryCalls.Add("az $cmd"); $global:LASTEXITCODE = 0
  if ($cmd -like 'account show *') { return '{"tenantId":"44444444-4444-4444-4444-444444444444"}' }
  if ($cmd -like 'account subscription list *') { return '[]' }
  if ($cmd -like 'ad app list --display-name gha-acme-los-dev *') { return ConvertTo-Json -InputObject @(@{ appId = $global:deliveryClient; displayName = 'gha-acme-los-dev' }) -Compress }
  if ($cmd -like 'role assignment list *') {
    if (-not $global:deliveryAssigned) { return '[]' }
    return ConvertTo-Json -InputObject @(@{ roleDefinitionName = 'Contributor'; scope = $global:deliveryScope }) -Compress
  }
  if ($cmd -like 'role assignment create *') { $global:deliveryAssigned = $true; return }
  throw "Unexpected Azure command: $cmd"
}
function global:gh {
  $cmd = $args -join ' '; $global:deliveryCalls.Add("gh $cmd"); $global:LASTEXITCODE = 0
  if ($cmd -eq 'api repos/example/acme-los/environments/dev --silent') { return }
  if ($cmd -like 'variable get AZURE_CLIENT_ID --env dev *') { return @{ value = if ($global:deliveryMismatch) { 'other-client' } else { $global:deliveryClient } } | ConvertTo-Json }
  if ($cmd -like 'variable set * --env dev --repo example/acme-los') { return }
  throw "Unexpected GitHub mutation: $cmd"
}
function Invoke-Sync([hashtable]$Extra = @{}) {
  & $entrypoint -Mode sync-environments -TargetEnvironment dev -SyncPlatformMonitorAccess `
    -GitHubOrganizationName example -GitHubRepositoryName acme-los `
    -AzureTenantId '44444444-4444-4444-4444-444444444444' `
    -PlatformSubscriptionId '22222222-2222-2222-2222-222222222222' `
    -NonProdSubscriptionId '33333333-3333-3333-3333-333333333333' `
    -ProdSubscriptionId '55555555-5555-5555-5555-555555555555' @Extra | Out-Null
}
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message } }
try {
  Invoke-Sync
  $writes = @($global:deliveryCalls | Where-Object { $_ -like 'gh variable set *' })
  Assert-True ($writes.Count -gt 20 -and @($writes | Where-Object { $_ -notlike '* --env dev *' }).Count -eq 0) 'only dev environment variables written'
  Assert-True (@($global:deliveryCalls | Where-Object { $_ -match '--method PUT|secret set|ad app create|ad sp create|graph.microsoft.com' }).Count -eq 0) 'gates, secrets, identities, and Graph privileges unchanged'
  $roles = @($global:deliveryCalls | Where-Object { $_ -like 'az role assignment create *' })
  Assert-True ($roles.Count -eq 1 -and $roles[0] -like "*--role Contributor --scope $global:deliveryScope --output none") 'only new monitoring group access granted'
  $global:deliveryCalls.Clear()
  Invoke-Sync
  Assert-True (@($global:deliveryCalls | Where-Object { $_ -like 'az role assignment create *' }).Count -eq 0) 'role grant is idempotent'
  $global:deliveryCalls.Clear(); $global:deliveryMismatch = $true
  $failed = $false
  try { Invoke-Sync } catch { $failed = $_.Exception.Message -match 'identity do not match' }
  Assert-True $failed 'identity drift rejected'
  Assert-True (@($global:deliveryCalls | Where-Object { $_ -like 'gh variable set *' -or $_ -like 'az role assignment create *' }).Count -eq 0) 'identity drift stops all writes'
  $global:deliveryCalls.Clear(); $global:deliveryMismatch = $false; $global:deliveryAssigned = $false
  Invoke-Sync @{ WhatIf = $true }
  Assert-True (@($global:deliveryCalls | Where-Object { $_ -like 'gh variable set *' -or $_ -like 'az role assignment create *' }).Count -eq 0) 'WhatIf does not mutate roles or variables'
  Write-Host 'Dev-only delivery sync preserves gates and other environments; identity continuity, role scope, retry, and WhatIf tests passed.'
} finally {
  Remove-Item Function:\global:az, Function:\global:gh -ErrorAction SilentlyContinue
}
