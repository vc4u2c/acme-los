Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '../teardown-web-environment.ps1'
$sub = '11111111-1111-1111-1111-111111111111'
$platform = '22222222-2222-2222-2222-222222222222'
$group = 'rg-acme-los-web-dev-cus-01'
$vault = 'kvacmelosdevcus01v42c'

function Assert-True($Value, [string]$Message) {
  if (-not $Value) { throw "Assertion failed: $Message" }
}
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch {
    Assert-True ($_.Exception.Message -match $Pattern) "expected $Pattern; received $($_.Exception.Message)"
    return
  }
  throw "Expected failure: $Pattern"
}
function global:Start-Sleep { throw 'Unexpected wait in teardown safety test' }
function global:az {
  $a = [string[]]$args
  $global:LASTEXITCODE = 0
  $command = $a -join ' '
  $global:teardownCalls.Add($command)
  if ($command -match '^stack .+ show') {
    if ($global:teardownFailure -eq 'permission') {
      $global:LASTEXITCODE = 1
      return 'ERROR: (AuthorizationFailed) Access denied'
    }
    if ($global:teardownFailure -eq 'missing') {
      $global:LASTEXITCODE = 1
      return 'ERROR: (DeploymentStackNotFound) Missing stack'
    }
    return
  }
  if ($command -match '^stack .+ delete') {
    if ($global:teardownFailure -eq 'delete') {
      $global:LASTEXITCODE = 1
      return 'ERROR: (Conflict) Resource locked'
    }
    return
  }
  if ($command -match '^group exists') { return $global:teardownGroupExists }
  if ($command -match '^keyvault list-deleted') {
    return '[{"name":"kvacmelosdevcus01v42c","location":"centralus"}]'
  }
  if ($command -match '^keyvault purge') { return }
  throw "Unexpected command: $command"
}
function Invoke-TestTeardown([hashtable]$Extra = @{}) {
  & $scriptPath -EnvironmentName dev -SubscriptionId $sub -PlatformSubscriptionId $platform @Extra | ConvertFrom-Json
}
$tests = [ordered]@{
  'default is a read-only plan without Azure mutations' = {
    $result = Invoke-TestTeardown
    Assert-True ($result.action -eq 'show-plan' -and -not $result.destructive) 'plan only'
    Assert-True (-not $result.keyVaultPurgeRequested) 'purge disabled by default'
    Assert-True ($global:teardownCalls.Count -eq 0) 'no Azure calls with explicit subscriptions'
  }
  'destroy requires exact resource group confirmation' = {
    Assert-Fails { Invoke-TestTeardown @{ Action = 'destroy' } } 'ConfirmResourceGroup'
    Assert-Fails { Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = 'other-group' } } 'ConfirmResourceGroup'
    Assert-True ($global:teardownCalls.Count -eq 0) 'no Azure calls'
  }
  'purge requires separate exact vault confirmation before deletion' = {
    Assert-Fails { Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = $group; PurgeDeletedKeyVault = $true } } 'ConfirmKeyVaultPurge'
    Assert-True ($global:teardownCalls.Count -eq 0) 'no deletions before purge confirmation'
  }
  'confirmed destroy does not purge Key Vault by default' = {
    $result = Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = $group }
    Assert-True (-not $result.keyVaultPurged) 'not purged'
    Assert-True (@($global:teardownCalls | Where-Object { $_ -match '^keyvault' }).Count -eq 0) 'no vault purge commands'
    $deletes = @($global:teardownCalls | Where-Object { $_ -match '^stack .+ delete' })
    $expected = @(
      "stack group delete --subscription $sub --name stk-acme-los-web-app-dev-cus-01 --resource-group $group --action-on-unmanage deleteResources --yes --output none --only-show-errors"
      "stack group delete --subscription $platform --name stk-acme-los-dns-links-dev-cus-01 --resource-group rg-acme-hub-network-cus-01 --action-on-unmanage deleteResources --yes --output none --only-show-errors"
      "stack group delete --subscription $platform --name stk-acme-los-monitor-dev-cus-01 --resource-group rg-acme-hub-monitor-cus-01 --action-on-unmanage deleteResources --yes --output none --only-show-errors"
      "stack sub delete --subscription $sub --name stk-acme-los-web-dev-cus-01 --action-on-unmanage deleteResources --yes --output none --only-show-errors"
    )
    Assert-True ($deletes.Count -eq $expected.Count) 'only four explicitly scoped stacks'
    for ($i = 0; $i -lt $expected.Count; $i++) {
      Assert-True ($deletes[$i] -ceq $expected[$i]) "exact subscription, scope, name, and deletion mode for stack $i"
    }
  }
  'retained resource group is reported without polling or broader deletion' = {
    $global:teardownGroupExists = 'true'
    $result = Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = $group; WaitForDeletion = $true }
    Assert-True $result.resourceGroupExists 'retained group remains visible in result'
    Assert-True (@($global:teardownCalls | Where-Object { $_ -match '^group exists' }).Count -eq 1) 'no polling for intentional retention'
    Assert-True (@($global:teardownCalls | Where-Object { $_ -match '^group delete|deleteAll' }).Count -eq 0) 'no expanded deletion'
  }
  'permission failure stops before any deletion' = {
    $global:teardownFailure = 'permission'
    Assert-Fails { Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = $group } } 'AuthorizationFailed'
    Assert-True ($global:teardownCalls.Count -eq 1) 'no further operations'
  }
  'failed delete stops before other stacks or vault purge' = {
    $global:teardownFailure = 'delete'
    Assert-Fails { Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = $group; PurgeDeletedKeyVault = $true; ConfirmKeyVaultPurge = $vault } } 'Resource locked'
    Assert-True ($global:teardownCalls.Count -eq 2) 'stops at failed deletion'
  }
  'missing stacks are tolerated without treating permission failures as absent' = {
    $global:teardownFailure = 'missing'
    Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = $group } | Out-Null
    Assert-True (@($global:teardownCalls | Where-Object { $_ -match '^stack .+ delete' }).Count -eq 0) 'no missing-stack deletion'
  }
  'explicit purge is scoped to the workload subscription' = {
    $result = Invoke-TestTeardown @{ Action = 'destroy'; ConfirmResourceGroup = $group; PurgeDeletedKeyVault = $true; ConfirmKeyVaultPurge = $vault }
    Assert-True $result.keyVaultPurged 'explicit purge completed'
    foreach ($call in @($global:teardownCalls | Where-Object { $_ -match '^keyvault' })) {
      Assert-True ($call.Contains("--subscription $sub")) 'vault operation scoped to subscription'
    }
  }
  'production requires its additional guard' = {
    Assert-Fails { & $scriptPath -EnvironmentName prod -Action destroy -ConfirmResourceGroup 'rg-acme-los-web-prod-cus-01' -SubscriptionId $sub -PlatformSubscriptionId $platform } 'Production teardown is blocked'
    Assert-True ($global:teardownCalls.Count -eq 0) 'no Azure calls'
  }
}
foreach ($test in $tests.GetEnumerator()) {
  $global:teardownCalls = [Collections.Generic.List[string]]::new()
  $global:teardownFailure = ''
  $global:teardownGroupExists = 'false'
  try { & $test.Value } catch { throw "FAIL $($test.Key): $($_.Exception.Message)" }
  Write-Host "PASS $($test.Key)"
}
Write-Host "$($tests.Count) teardown tests passed. No Azure calls were made."
