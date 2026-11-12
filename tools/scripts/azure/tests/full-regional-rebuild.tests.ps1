# Pure helper tests: destructive Azure requests must remain scoped and fail closed.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../full-regional-rebuild.ps1')
. (Join-Path $PSScriptRoot '../dev-retirement.ps1')
. (Join-Path $PSScriptRoot '../private-connectivity.ps1')
$configuration = Get-Content (Join-Path $PSScriptRoot '../../../../infra/azure/config/platform.json') -Raw | ConvertFrom-Json
$passed = 0
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message }; $script:passed++ }
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch { Assert-True ($_.Exception.Message -match $Pattern) "Expected $Pattern, received $($_.Exception.Message)"; return }
  throw "Expected failure: $Pattern"
}
function Copy-Object($Value) { $Value | ConvertTo-Json -Depth 40 | ConvertFrom-Json }
$scope = Get-FullRegionalRebuildScope $configuration
Assert-True ($scope.Subscription -cne $scope.PlatformSubscription) 'separate workload and platform scopes'
foreach ($field in @('projectName', 'primaryLocation', 'primaryRegionShortName')) {
  $invalid = Copy-Object $configuration
  $invalid.$field = 'other'
  Assert-Fails { Get-FullRegionalRebuildScope $invalid } 'restricted'
}
$invalid = Copy-Object $configuration
$invalid.environments.dev | Add-Member runtimeRegion ([pscustomobject]@{ location = 'eastus2'; shortName = 'eus2' })
Assert-Fails { Get-FullRegionalRebuildScope $invalid } 'restricted'
foreach ($field in @('monitorResourceGroupName', 'networkResourceGroupName', 'publicDnsResourceGroupName')) {
  $invalid = Copy-Object $configuration
  $invalid.platformResources.$field = 'shared-unrelated-group'
  Assert-Fails { Get-FullRegionalRebuildScope $invalid } 'restricted'
}
$oldIds = @(Get-FullRebuildOldWorkloadIds $scope)
Assert-True ($oldIds.Count -eq 7) 'explicit old workload inventory'
foreach ($id in $oldIds) { Assert-True ($id.StartsWith($scope.OldId + '/providers/')) 'workload inventory cannot escape old group' }
Assert-FullRebuildInventory @() $oldIds
Assert-FullRebuildInventory @($oldIds | ForEach-Object { @{ id = $_ } }) $oldIds
foreach ($id in @($scope.TargetId, '/subscriptions/other/resourceGroups/shared', "$($scope.OldId)/providers/Microsoft.Sql/servers/unexpected")) {
  Assert-Fails { Assert-FullRebuildInventory @(@{ id = $id }) $oldIds } 'Unexpected resource'
}
$stack = Copy-Object @{ provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }; resources = @(@{ id = $oldIds[0] }); failedResources = @() }
Assert-FullRebuildStack $stack $oldIds
$stack.provisioningState = 'running'
Assert-Fails { Assert-FullRebuildStack $stack $oldIds } 'terminal'
$stack.provisioningState = 'succeeded'
$stack.denySettings.mode = 'denyDelete'
Assert-Fails { Assert-FullRebuildStack $stack $oldIds } 'terminal'
$stack.denySettings.mode = 'none'
$stack.failedResources = @(@{ id = $scope.TargetAcsId })
Assert-Fails { Assert-FullRebuildStack $stack $oldIds } 'Unexpected resource'

$calls = @()
$wrongDigest = $false
function Invoke-AzureDnsJson {
  param([string[]]$Arguments)
  $script:calls += ,$Arguments
  if (($Arguments[0..2] -join ' ') -cne 'acr manifest show-metadata') { throw 'Unexpected Azure mutation during tests' }
  $name = $Arguments[[array]::IndexOf($Arguments, '--name') + 1]
  $image = @($script:scope.Images | Where-Object { $name -ceq "$($_.Repository):$($script:scope.ImageTag)" })
  if ($image.Count -ne 1) { throw 'Unexpected image' }
  return @{ digest = if ($script:wrongDigest) { 'sha256:changed' } else { $image[0].Digest } }
}
Assert-FullRebuildImages $scope $scope.TargetRegistry
Assert-True ($calls.Count -eq 2) 'both pinned images validated'
$wrongDigest = $true
Assert-Fails { Assert-FullRebuildImages $scope $scope.TargetRegistry } 'digest'

$acs = Copy-Object @{ id = $scope.OldAcsId; location = 'global'; tags = @{ 'acme:application' = 'acme-los' }; properties = @{ disableLocalAuth = $true; immutableResourceId = $scope.AcsImmutableId; hostName = $scope.AcsHostName; dataLocation = 'United States' } }
Assert-FullRebuildAcs $scope $acs
$acs.id = $scope.TargetAcsId
Assert-FullRebuildAcs $scope $acs
foreach ($field in @('immutableResourceId', 'hostName', 'dataLocation', 'disableLocalAuth')) {
  $invalidAcs = Copy-Object $acs
  $invalidAcs.properties.$field = if ($field -eq 'disableLocalAuth') { $false } else { 'changed' }
  Assert-Fails { Assert-FullRebuildAcs $scope $invalidAcs } 'immutable identity'
}
$validationStatus = 204
$validationCalls = 0
function Invoke-AzureDnsJson {
  param([string[]]$Arguments, [switch]$AllowMissing)
  if (($Arguments[0..1] -join ' ') -ceq 'account get-access-token') { return @{ accessToken = 'synthetic-test-token' } }
  if (($Arguments[0..2] -join ' ') -ceq 'stack group show') { return Copy-Object $script:existingStack }
  throw 'Unexpected Azure request'
}
function Invoke-WebRequest {
  param($Method, $Uri, $Headers, $ContentType, $Body, $TimeoutSec, $MaximumRedirection, [switch]$UseBasicParsing)
  $script:validationCalls++
  if ($script:validationStatus -eq 409) { throw 'synthetic rejection' }
  @{ StatusCode = $script:validationStatus; Headers = @{} }
}
Assert-FullRebuildMove $scope
Assert-True ($validationCalls -eq 1) 'validate-only POST completes before ownership detach'
$validationStatus = 409
Assert-Fails { Assert-FullRebuildMove $scope } 'was not detached'
$existingStack = Copy-Object @{ provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }; resources = @(@{ id = $scope.TargetId }); parameters = @{ regionShortName = @{ value = 'eus' }; location = @{ value = 'eastus' } } }
Assert-FullRebuildTargetStack $scope 'group' 'test' 'test' @($scope.TargetId)
$existingStack.resources = @(@{ id = $scope.OldId })
Assert-Fails { Assert-FullRebuildTargetStack $scope 'group' 'test' 'test' @($scope.TargetId) } 'Unexpected resource'
$existingStack.resources = @(@{ id = $scope.TargetId })
$existingStack.denySettings.mode = 'denyDelete'
Assert-Fails { Assert-FullRebuildTargetStack $scope 'group' 'test' 'test' @($scope.TargetId) } 'terminal'
$existingStack.denySettings.mode = 'none'
$existingStack.parameters.regionShortName.value = 'cus'
Assert-Fails { Assert-FullRebuildTargetStack $scope 'group' 'test' 'test' @($scope.TargetId) } 'Existing target stack'

$dev = Get-DevRetirementScope $configuration $scope.Subscription $scope.PlatformSubscription
Assert-True ($dev.Group -ceq 'rg-acme-los-web-dev-eus-01' -and $dev.FoundationGroup -ceq $dev.Group -and -not $dev.Relocated) 'full rebuild is single region'
Assert-True ($dev.AcsId -ceq $scope.TargetAcsId) 'global ACS name remains stable'
Assert-True ($dev.VaultId -like '*/kvacmelosdeveus01v42c') 'new vault'
Assert-True ($dev.Registry -ceq $scope.TargetRegistry) 'new registry'
foreach ($id in @($dev.VaultId, $dev.IdentityId, $dev.AcsId, "$($dev.Id)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-eus-01")) {
  Assert-True ((Get-RetirementResourceClass $dev $id) -ceq 'retained') 'East US foundation remains retained for ordinary pause/retirement'
}
foreach ($id in @(Get-DevDisposableResourceIds $dev)) {
  Assert-True ((Get-RetirementResourceClass $dev $id) -ceq 'disposable') 'East US runtime classified disposable'
}
Assert-True (@(Get-DevDisposableResourceIds $dev).Count -eq 9) 'full rebuild does not turn retained VNet into disposable runtime'
foreach ($pair in @(@('eus', 'centralus'), @('cus', 'eastus'), @('wus', 'westus'))) {
  $invalid = Copy-Object $configuration
  $invalid.primaryRegionShortName = $pair[0]; $invalid.primaryLocation = $pair[1]
  Assert-Fails { Get-DevRetirementScope $invalid $scope.Subscription $scope.PlatformSubscription } 'restricted'
}
$group = @{ tags = @{ 'acme:retirement' = 'rebuilding'; 'acme:runtime-region' = 'eus' } }
function Invoke-AzJson { param([string[]]$Arguments) return Copy-Object $script:group }
Assert-WebEnvironmentNotHibernated $scope.Subscription $dev.Group -RecoverRetired -ExpectedRuntimeRegion 'eus'
Assert-Fails { Assert-WebEnvironmentNotHibernated $scope.Subscription 'rg-other-web-dev-eus-01' -RecoverRetired -ExpectedRuntimeRegion 'eus' } 'lifecycle'
Assert-Fails { Assert-WebEnvironmentNotHibernated $scope.Subscription $dev.Group -RecoverRetired -ExpectedRuntimeRegion 'cus' } 'region differs'
$group.tags.'acme:retirement' = 'retired'
Assert-Fails { Assert-WebEnvironmentNotHibernated $scope.Subscription $dev.Group -RecoverRetired -ExpectedRuntimeRegion 'eus' } 'lifecycle'
Write-Host "$passed full regional rebuild assertions passed. No Azure calls were made."
