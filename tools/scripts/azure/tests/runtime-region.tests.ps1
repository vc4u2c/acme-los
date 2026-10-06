# Mixed-region safety tests use real helpers with in-memory ARM responses only.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../private-connectivity.ps1')
. (Join-Path $PSScriptRoot '../dev-retirement.ps1')
$configuration = Get-Content (Join-Path $PSScriptRoot '../../../../infra/azure/config/platform.json') -Raw | ConvertFrom-Json
# Keep the previous split-region contract covered independently of the current deployment target.
$configuration.primaryLocation = 'centralus'
$configuration.primaryRegionShortName = 'cus'
$configuration.environments.dev | Add-Member -Force runtimeRegion ([pscustomobject]@{ location = 'eastus2'; shortName = 'eus2' })
$sub = '11111111-1111-1111-1111-111111111111'
$platform = '22222222-2222-2222-2222-222222222222'
$scope = Get-DevRetirementScope $configuration $sub $platform
$passed = 0
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message }; $script:passed++ }
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch { Assert-True ($_.Exception.Message -match $Pattern) "Expected $Pattern, received $($_.Exception.Message)"; return }
  throw "Expected failure: $Pattern"
}
function Copy-Object($Value) { $Value | ConvertTo-Json -Depth 40 | ConvertFrom-Json }
function Get-Argument($Arguments, $Name) { $Arguments[[array]::IndexOf($Arguments, $Name) + 1] }

$region = Get-WebRuntimeRegion $configuration 'dev'
Assert-True ($region.Location -ceq 'eastus2' -and $region.ShortName -ceq 'eus2' -and $region.Relocated) 'dev targets East US 2'
Assert-True ($configuration.primaryLocation -ceq 'centralus') 'retained global location unchanged'
foreach ($environment in @('qa', 'stg', 'prod')) {
  $other = Get-WebRuntimeRegion $configuration $environment
  Assert-True ($other.Location -ceq 'centralus' -and -not $other.Relocated) "$environment is unchanged"
  $invalid = Copy-Object $configuration
  $invalid.environments.$environment | Add-Member runtimeRegion $configuration.environments.dev.runtimeRegion
  Assert-Fails { Get-WebRuntimeRegion $invalid $environment } 'Only the reviewed'
}
foreach ($value in @('centralus', 'eastus', 'westus2', '')) {
  $invalid = Copy-Object $configuration
  $invalid.environments.dev.runtimeRegion.location = $value
  Assert-Fails { Get-WebRuntimeRegion $invalid 'dev' } 'Only the reviewed'
}

# Execute the actual naming functions used by every runtime consumer.
foreach ($file in @('deploy-web-environment.ps1', 'configure-web-custom-domain.ps1', 'set-web-environment-state.ps1', 'setup-github-azure-environments.ps1')) {
  & {
    $tokens = $null; $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot "../$file"), [ref]$tokens, [ref]$errors)
    Assert-True ($errors.Count -eq 0) "$file parses"
    $names = @('Get-WorkloadResourceGroupName', 'Get-ContainerAppName', 'Get-BffContainerAppName', 'Get-ContainerAppEnvironmentName', 'Get-UserAssignedIdentityName', 'Get-KeyVaultName', 'Get-ContainerRegistryName')
    foreach ($node in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
      if ($node.Name -in $names) { . ([scriptblock]::Create($node.Extent.Text)) }
    }
    Assert-True ((Get-WorkloadResourceGroupName $configuration 'dev') -ceq $scope.Group) "$file selects runtime RG"
    if ($file -ne 'deploy-web-environment.ps1') { Assert-True ((Get-ContainerAppName $configuration 'dev') -ceq 'ca-acme-los-web-dev-eus2-01') "$file selects runtime app" }
    if ($file -eq 'setup-github-azure-environments.ps1') {
      Assert-True ((Get-UserAssignedIdentityName $configuration 'dev') -ceq 'id-acme-los-web-dev-cus-01') 'identity stays Central US'
      Assert-True ((Get-KeyVaultName $configuration 'dev') -ceq 'kvacmelosdevcus01v42c') 'vault stays Central US'
      Assert-True ((Get-ContainerRegistryName $configuration 'nonprod') -ceq 'acracmelosnonprodcus01v42c') 'registry stays Central US'
    }
  }
}

Assert-True ($scope.FoundationGroup -ceq 'rg-acme-los-web-dev-cus-01' -and $scope.Group -ceq 'rg-acme-los-web-dev-eus2-01') 'scope separates ownership groups'
$disposable = @(Get-DevDisposableResourceIds $scope)
Assert-True ($disposable.Count -eq 14) 'regional disposal includes five new network resources and nine runtime resources'
foreach ($id in $disposable) {
  Assert-True ($id.StartsWith($scope.Id + '/')) 'disposal cannot escape the runtime group'
  Assert-True ((Get-RetirementResourceClass $scope $id) -eq 'disposable') 'runtime resource classified disposable'
}
foreach ($id in @($scope.VaultId, $scope.IdentityId, $scope.AcsId, "$($scope.FoundationId)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01")) {
  Assert-True ((Get-RetirementResourceClass $scope $id) -eq 'retained') 'foundation cannot become disposable'
}
Assert-Fails { Get-RetirementResourceClass $scope ($scope.VaultId -replace 'devcus', 'deveus2') } 'Unexpected stack resource'

$vnet = "$($scope.Id)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-eus2-01"
$dataSubnet = "$vnet/subnets/snet-acme-los-data-dev-eus2-01"
$networkScope = "/subscriptions/$platform/resourceGroups/$($configuration.platformResources.networkResourceGroupName)"
$script:resources = @{}
$script:resources[$dataSubnet] = @{ id = $dataSubnet }
$script:resources[$scope.VaultId] = @{ location = 'centralus'; tags = @{ 'acme:environment' = 'dev' }; properties = @{ publicNetworkAccess = 'Disabled' } }
$script:resources[$scope.RedisId] = @{ location = 'eastus2'; tags = @{ 'acme:environment' = 'dev' }; properties = @{ publicNetworkAccess = 'Disabled' } }
$script:resources[$scope.IdentityId] = @{ properties = @{ isolationScope = 'None' } }
foreach ($zone in @('privatelink.vaultcore.azure.net', 'privatelink.redis.azure.net')) {
  $id = "$networkScope/providers/Microsoft.Network/privateDnsZones/$zone"
  $script:resources[$id] = @{ id = $id }
  $script:resources["$id/virtualNetworkLinks"] = @{ value = @(@{ properties = @{ virtualNetwork = @{ id = $vnet }; provisioningState = 'Succeeded'; virtualNetworkLinkState = 'Completed' } }) }
}
$script:foundation = @{ provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }; parameters = @{ resourcePhase = @{ value = 'retained' } }; resources = @(@{ id = $scope.VaultId }) }
$script:runtime = @{
  provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }; parameters = @{ resourcePhase = @{ value = 'disposable' } }
  resources = @($disposable | ForEach-Object { @{ id = $_ } })
  outputs = @{ workloadVirtualNetworkId = @{ value = $vnet }; dataSubnetName = @{ value = 'snet-acme-los-data-dev-eus2-01' }; keyVaultId = @{ value = $scope.VaultId }; redisClusterId = @{ value = $scope.RedisId } }
}
function Invoke-AzJson {
  param([string[]]$Arguments)
  if (($Arguments[0..2] -join ' ') -eq 'stack group show') {
    $name = Get-Argument $Arguments '--name'
    $group = Get-Argument $Arguments '--resource-group'
    if ($name -ceq $script:scope.RetainedStack -and $group -ceq $script:scope.FoundationGroup) { return Copy-Object $script:foundation }
    if ($name -ceq $script:scope.DisposableStack -and $group -ceq $script:scope.Group) { return Copy-Object $script:runtime }
    throw 'Unexpected stack read'
  }
  if (($Arguments[0..2] -join ' ') -eq 'rest --method get') {
    $id = (Get-Argument $Arguments '--uri').Split('?')[0]
    if ($script:resources.ContainsKey($id)) { return Copy-Object $script:resources[$id] }
    if ($id -like "$($script:scope.Id)/providers/Microsoft.Network/privateEndpoints/*" -or $id -like "$($script:scope.FoundationId)/providers/*") { return $null }
  }
  throw 'Unexpected Azure request; all test boundaries must be mocked'
}
$plan = @(Get-DevPrivateConnectivityPlan $configuration $sub $platform $scope.Group)
Assert-True ($plan.Count -eq 2 -and @($plan | Where-Object ready).Count -eq 0) 'two missing regional endpoints can be restored'
Assert-True ($plan[0].targetId -eq $scope.VaultId -and $plan[1].targetId -eq $scope.RedisId) 'cross-region vault and local Redis targets'
foreach ($entry in $plan) {
  Assert-True ($entry.parameters.location.value -ceq 'eastus2' -and $entry.parameters.subnetId.value -eq $dataSubnet) 'endpoints use regional network'
}
Assert-True ($plan[1].recordName -ceq 'redis-acme-los-dev-eus2-01.eastus2') 'Redis DNS uses the runtime region'
Assert-Fails { Get-DevPrivateConnectivityPlan $configuration $sub $platform $scope.FoundationGroup } 'regional runtime group'
$script:resources[$scope.VaultId].location = 'eastus2'
Assert-Fails { Get-DevPrivateConnectivityPlan $configuration $sub $platform $scope.Group } 'service region'
$script:resources[$scope.VaultId].location = 'centralus'
$script:resources[$scope.VaultId].properties.publicNetworkAccess = 'Enabled'
Assert-Fails { Get-DevPrivateConnectivityPlan $configuration $sub $platform $scope.Group } 'private-only'
$script:resources[$scope.VaultId].properties.publicNetworkAccess = 'Disabled'
$script:foundation.resources = @()
Assert-Fails { Get-DevPrivateConnectivityPlan $configuration $sub $platform $scope.Group } 'does not own'
$script:foundation.resources = @(@{ id = $scope.VaultId })

Assert-RetiredCentralRuntime $scope
$script:resources[$scope.IdentityId].properties.isolationScope = 'Regional'
Assert-Fails { Assert-RetiredCentralRuntime $scope } 'forbids cross-region'
$script:resources[$scope.IdentityId].properties.isolationScope = 'None'
$oldRedis = "$($scope.FoundationId)/providers/Microsoft.Cache/redisEnterprise/redis-acme-los-dev-cus-01"
$script:resources[$oldRedis] = @{ id = $oldRedis }
Assert-Fails { Assert-RetiredCentralRuntime $scope } 'two active regions'

$script:validationCalls = @()
$script:rejectValidation = $false
function Invoke-AzNoOutput {
  param([string[]]$Arguments)
  $script:validationCalls += ,$Arguments
  if ($script:rejectValidation) { throw 'Synthetic provider rejection' }
}
$template = Copy-Object @{ parameters = @{ redisSkuName = @{ defaultValue = 'Balanced_B0' }; redisClusteringPolicy = @{ defaultValue = 'NoCluster' } } }
$parameters = Copy-Object @{}
Assert-RegionalRedisPreflight $configuration 'qa' $sub 'unused' $template $parameters
Assert-True ($script:validationCalls.Count -eq 0) 'legacy environments do not gain a regional preflight'
Assert-RegionalRedisPreflight $configuration 'dev' $sub $scope.Group $template $parameters
$call = $script:validationCalls[0]
Assert-True (($call[0..2] -join ' ') -ceq 'deployment group validate') 'preflight validates without creating resources'
Assert-True ((Get-Argument $call '--validation-level') -ceq 'Provider') 'provider checks are not skipped'
Assert-True ($call -contains 'skuName=Balanced_B0' -and $call -contains 'location=eastus2' -and $call -contains 'clusteringPolicy=NoCluster') 'preflight uses source defaults and regional location'
$parameters = Copy-Object @{ redisSkuName = @{ value = 'Balanced_B1' } }
Assert-RegionalRedisPreflight $configuration 'dev' $sub $scope.Group $template $parameters
Assert-True ($script:validationCalls[1] -contains 'skuName=Balanced_B1') 'explicit source overrides are validated without fallback'
Assert-Fails { Assert-RegionalRedisPreflight $configuration 'dev' $sub $scope.FoundationGroup $template $parameters } 'regional runtime group'
$script:rejectValidation = $true
Assert-Fails { Assert-RegionalRedisPreflight $configuration 'dev' $sub $scope.Group $template $parameters } 'failed before runtime provisioning'
Assert-True ($script:validationCalls.Count -eq 3) 'a failed validation is not retried with a larger tier'
$deploySource = Get-Content (Join-Path $PSScriptRoot '../deploy-web-environment.ps1') -Raw
Assert-True ($deploySource.IndexOf('Assert-RegionalRedisPreflight $configuration') -lt $deploySource.IndexOf('Invoke-AzNoOutput -Arguments $webDeploymentArguments')) 'preflight runs before paid runtime deployment'

$script:inventory = @($disposable | ForEach-Object { @{ id = $_ } })
function Invoke-AzureDnsJson {
  param([string[]]$Arguments)
  if (($Arguments[0..1] -join ' ') -cne 'resource list' -or (Get-Argument $Arguments '--resource-group') -cne $script:scope.Group) { throw 'Unexpected inventory request' }
  return $script:inventory
}
Assert-RegionalRuntimeInventory $scope 'apply-dev.los.avanai.net'
Assert-True ($true) 'owned regional inventory accepted'
$script:inventory += @{ id = $scope.VaultId }
Assert-Fails { Assert-RegionalRuntimeInventory $scope 'apply-dev.los.avanai.net' } 'unexpected resource'
Write-Host "$passed regional runtime assertions passed. No Azure operations were performed."
