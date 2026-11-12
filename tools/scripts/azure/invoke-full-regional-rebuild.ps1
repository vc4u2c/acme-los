[CmdletBinding()]
param(
  [ValidateSet('plan', 'prepare', 'cleanup')][string]$Action = 'plan',
  [switch]$Apply,
  [string]$ConfirmWorkload,
  [string]$ConfigurationPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ConfigurationPath) { $ConfigurationPath = Join-Path $PSScriptRoot '../../../infra/azure/config/platform.json' }
. (Join-Path $PSScriptRoot 'azure-dns.ps1')
. (Join-Path $PSScriptRoot 'private-connectivity.ps1')
. (Join-Path $PSScriptRoot 'public-domain.ps1')
. (Join-Path $PSScriptRoot 'full-regional-rebuild.ps1')
. (Join-Path $PSScriptRoot 'dev-retirement.ps1')
function Invoke-AzJson { param([string[]]$Arguments) Invoke-AzureDnsJson $Arguments }

$configuration = Get-Content -LiteralPath $ConfigurationPath -Raw | ConvertFrom-Json
$scope = Get-FullRegionalRebuildScope $configuration
if ($Action -ne 'plan' -and (-not $Apply -or $ConfirmWorkload -cne 'acme-los-dev-centralus-to-eastus')) { throw 'Mutations require Apply and ConfirmWorkload acme-los-dev-centralus-to-eastus.' }
foreach ($subscription in @($scope.Subscription, $scope.PlatformSubscription)) {
  $account = Invoke-AzureDnsJson @('account', 'show', '--subscription', $subscription)
  if ($account.tenantId -cne $scope.Tenant -or $account.id -cne $subscription -or $account.state -ine 'Enabled') { throw 'Azure account does not match the approved rebuild tenant/subscription.' }
}
$dns = Get-AzureWebDnsConfiguration $configuration 'dev' $scope.PlatformSubscription
$zone = Get-AzureWebDnsZone $dns
Assert-AzureWebDnsDelegation $dns $zone
$oldResources = @(Invoke-AzureDnsJson @('resource', 'list', '--subscription', $scope.Subscription, '--resource-group', $scope.OldGroup) -AllowMissing | ForEach-Object { $_ })
$oldResources = @($oldResources | Where-Object { $null -ne $_ })
Assert-FullRebuildInventory $oldResources (Get-FullRebuildOldWorkloadIds $scope)
$images = @(Invoke-AzureDnsJson @('resource', 'list', '--subscription', $scope.Subscription, '--resource-group', $scope.OldImagesGroup) -AllowMissing | ForEach-Object { $_ } | Where-Object { $null -ne $_ })
Assert-FullRebuildInventory $images @($scope.OldRegistryId)
$oldMonitorIds = @(Get-FullRebuildOldMonitoringIds $scope)
$oldLinks = @('kv/privatelink.vaultcore.azure.net', 'redis/privatelink.redis.azure.net' | ForEach-Object {
  $parts = $_.Split('/')
  "/subscriptions/$($scope.PlatformSubscription)/resourceGroups/rg-acme-hub-network-cus-01/providers/Microsoft.Network/privateDnsZones/$($parts[1])/virtualNetworkLinks/pdzlnk-acme-los-$($parts[0])-dev-cus-01"
})
$oldRetainedIds = @(Get-FullRebuildOldWorkloadIds $scope | Where-Object { $_ -notlike '*/Application Insights Smart Detection' }) + @(
  "$($scope.OldId)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01/subnets/snet-acme-los-app-dev-cus-01",
  "$($scope.OldId)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01/subnets/snet-acme-los-data-dev-cus-01",
  "$($scope.OldId)/providers/Microsoft.KeyVault/vaults/kvacmelosdevcus01v42c/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-kv-dev-cus-01",
  "$($scope.OldRegistryId)/providers/Microsoft.Authorization/roleAssignments/17f67673-fff6-5e86-80a5-2d1f835dcd84",
  "$($scope.OldId)/providers/Microsoft.KeyVault/vaults/kvacmelosdevcus01v42c/providers/Microsoft.Authorization/roleAssignments/d0aa404f-7f15-5f1d-b8a1-e784b97f80bc",
  "$($scope.OldAcsId)/providers/Microsoft.Authorization/roleAssignments/1c8d3812-6a16-52bc-bb3a-e827e5fe2c15"
)

if ($Action -eq 'plan') {
  [ordered]@{
    from = 'centralus'; to = 'eastus'; workload = 'acme-los/dev'
    replace = @('Key Vault', 'runtime identity', 'ACR', 'VNet/NSGs', 'monitoring', 'ACA', 'Redis', 'private endpoints')
    preserve = @('global public/private DNS', 'global ACS and phone', 'Okta', 'Entra deployment identities', 'other applications')
    oldWorkloadResources = @($oldResources | ForEach-Object { $_.id }); oldRegistry = @($images | ForEach-Object { $_.id })
    oldMonitoringResources = $oldMonitorIds; oldPrivateDnsLinks = $oldLinks
    targetGroup = $scope.TargetGroup; protectedVaultRetentionDays = 90
    images = $scope.Images
  } | ConvertTo-Json -Depth 8
  return
}

if ($Action -eq 'prepare') {
  Assert-NoActiveWorkloadDeployment $scope.Subscription $scope.OldGroup
  $oldGroup = Invoke-AzureDnsJson @('group', 'show', '--subscription', $scope.Subscription, '--name', $scope.OldGroup)
  if ($oldGroup.tags.'acme:retirement' -cne 'retired') { throw 'Retire the old runtime before the full regional rebuild.' }
  Assert-FullRebuildImages $scope $scope.OldRegistry
  $templateRoot = Join-Path $PSScriptRoot '../../../infra/azure/bicep'
  Assert-FullRebuildTargetStack $scope 'sub' 'stk-acme-los-web-dev-eus-01' '' @($scope.TargetId)
  Assert-FullRebuildTargetStack $scope 'sub' 'stk-acme-los-images-nonprod-eus-01' '' @("/subscriptions/$($scope.Subscription)/resourceGroups/$($scope.TargetImagesGroup)")
  Assert-FullRebuildTargetStack $scope 'group' 'stk-acme-los-images-registry-nonprod-eus-01' $scope.TargetImagesGroup @("/subscriptions/$($scope.Subscription)/resourceGroups/$($scope.TargetImagesGroup)/providers/Microsoft.ContainerRegistry/registries/$($scope.TargetRegistry)")
  $targetImagesGroup = Invoke-AzureDnsJson @('group', 'show', '--subscription', $scope.Subscription, '--name', $scope.TargetImagesGroup) -AllowMissing
  if ($targetImagesGroup) {
    if ($targetImagesGroup.location -ine 'eastus' -or $targetImagesGroup.tags.'acme:application' -cne 'acme-los' -or $targetImagesGroup.tags.'acme:environment' -cne 'nonprod') { throw 'Existing images group does not belong to the reviewed East US nonprod workload.' }
    Assert-NoActiveWorkloadDeployment $scope.Subscription $scope.TargetImagesGroup
    $targetRegistryId = "/subscriptions/$($scope.Subscription)/resourceGroups/$($scope.TargetImagesGroup)/providers/Microsoft.ContainerRegistry/registries/$($scope.TargetRegistry)"
    Assert-FullRebuildInventory @(Invoke-AzureDnsJson @('resource', 'list', '--subscription', $scope.Subscription, '--resource-group', $scope.TargetImagesGroup) | ForEach-Object { $_ }) @($targetRegistryId)
    $registry = Get-ConnectivityResource $targetRegistryId '2023-07-01'
    if ($registry -and ($registry.location -ine 'eastus' -or $registry.tags.'acme:application' -cne 'acme-los' -or $registry.properties.adminUserEnabled)) { throw 'Existing registry ownership, location, or authentication settings differ from the approved target.' }
  }
  $targetGroup = Invoke-AzureDnsJson @('group', 'show', '--subscription', $scope.Subscription, '--name', $scope.TargetGroup) -AllowMissing
  if ($targetGroup -and ($targetGroup.location -ine 'eastus' -or $targetGroup.tags.'acme:application' -cne 'acme-los' -or $targetGroup.tags.'acme:environment' -cne 'dev')) { throw 'Existing target group does not belong to the East US dev workload.' }
  if ($targetGroup) {
    $targetScope = Get-DevRetirementScope $configuration $scope.Subscription $scope.PlatformSubscription
    $allowed = @(Get-DevDisposableResourceIds $targetScope) + @($targetScope.VaultId, $targetScope.IdentityId, $targetScope.AcsId)
    foreach ($kind in @('app', 'data')) { $allowed += "$($scope.TargetId)/providers/Microsoft.Network/networkSecurityGroups/nsg-acme-los-$kind-dev-eus-01" }
    $allowed += "$($scope.TargetId)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-eus-01"
    foreach ($kind in @('web', 'bff')) { $allowed += "$($scope.TargetId)/providers/Microsoft.App/containerApps/ca-acme-los-$kind-dev-eus-01" }
    foreach ($kind in @('kv', 'redis')) { $allowed += "$($scope.TargetId)/providers/Microsoft.Network/networkInterfaces/nic-acme-los-$kind-dev-eus-01" }
    $allowed += "$($scope.TargetId)/providers/Microsoft.Insights/actionGroups/Application Insights Smart Detection"
    Assert-FullRebuildInventory @(Invoke-AzureDnsJson @('resource', 'list', '--subscription', $scope.Subscription, '--resource-group', $scope.TargetGroup) | ForEach-Object { $_ }) $allowed
  }
  if (-not $targetGroup) {
    Invoke-AzureDnsJson @('stack', 'sub', 'create', '--subscription', $scope.Subscription, '--name', 'stk-acme-los-web-dev-eus-01', '--location', 'eastus', '--template-file', "$templateRoot/main.workload.sub.bicep", '--parameters', 'environmentName=dev', 'location=eastus', 'regionShortName=eus', '--action-on-unmanage', 'detachAll', '--deny-settings-mode', 'none', '--yes') | Out-Null
  }
  Assert-NoActiveWorkloadDeployment $scope.Subscription $scope.TargetGroup
  $oldAcs = Get-ConnectivityResource $scope.OldAcsId '2025-09-01'
  if ($oldAcs) {
    Assert-FullRebuildAcs $scope $oldAcs
    Write-Host 'Validating the same-subscription move of the global ACS resource.'
    Assert-FullRebuildMove $scope
  }
  Write-Host 'Preparing East US monitoring and image-registry resource groups.'
  $monitorGroup = Invoke-AzureDnsJson @('group', 'show', '--subscription', $scope.PlatformSubscription, '--name', $scope.TargetMonitorGroup) -AllowMissing
  if ($monitorGroup) {
    if ($monitorGroup.location -ine 'eastus' -or $monitorGroup.tags.'acme:application' -cne 'acme-platform') { throw 'Existing monitoring group is not the reviewed East US platform group.' }
  } else {
    Invoke-AzureDnsJson @('deployment', 'sub', 'create', '--subscription', $scope.PlatformSubscription, '--name', 'dep-acme-monitor-eus-01', '--location', 'eastus', '--template-file', "$templateRoot/main.web.monitoring.sub.bicep", '--parameters', 'location=eastus', 'regionShortName=eus') | Out-Null
  }
  Invoke-AzureDnsJson @('stack', 'sub', 'create', '--subscription', $scope.Subscription, '--name', 'stk-acme-los-images-nonprod-eus-01', '--location', 'eastus', '--template-file', "$templateRoot/main.images.sub.bicep", '--parameters', 'subscriptionRole=nonprod', 'location=eastus', 'regionShortName=eus', '--action-on-unmanage', 'detachAll', '--deny-settings-mode', 'none', '--yes') | Out-Null
  Invoke-AzureDnsJson @('stack', 'group', 'create', '--subscription', $scope.Subscription, '--resource-group', $scope.TargetImagesGroup, '--name', 'stk-acme-los-images-registry-nonprod-eus-01', '--template-file', "$templateRoot/main.images.rg.bicep", '--parameters', 'subscriptionRole=nonprod', 'location=eastus', 'regionShortName=eus', '--action-on-unmanage', 'detachAll', '--deny-settings-mode', 'none', '--yes') | Out-Null
  $repositories = @(Invoke-AzureDnsJson @('acr', 'repository', 'list', '--subscription', $scope.Subscription, '--name', $scope.TargetRegistry) | ForEach-Object { $_ })
  foreach ($entry in $scope.Images) {
    $tags = if ($entry.Repository -in $repositories) { @(Invoke-AzureDnsJson @('acr', 'repository', 'show-tags', '--subscription', $scope.Subscription, '--name', $scope.TargetRegistry, '--repository', $entry.Repository) | ForEach-Object { $_ }) } else { @() }
    if ($scope.ImageTag -notin $tags) {
      Write-Host "Importing pinned $($entry.Repository) image into East US."
      Invoke-AzureDnsJson @('acr', 'import', '--subscription', $scope.Subscription, '--name', $scope.TargetRegistry, '--registry', $scope.OldRegistryId, '--source', "$($entry.Repository)@$($entry.Digest)", '--image', "$($entry.Repository):$($scope.ImageTag)") | Out-Null
    }
  }
  Assert-FullRebuildImages $scope $scope.TargetRegistry

  $oldAcs = Get-ConnectivityResource $scope.OldAcsId '2025-09-01'
  $targetAcs = Get-ConnectivityResource $scope.TargetAcsId '2025-09-01'
  if ($oldAcs -and $targetAcs) { throw 'ACS exists in both groups; review before continuing.' }
  if ($oldAcs) {
    Assert-FullRebuildAcs $scope $oldAcs
    # Moving the global resource preserves its endpoint and resource-bound phone; never release the number.
    Remove-FullRebuildStack $scope $scope.Subscription $scope.OldGroup 'stk-acme-los-web-app-dev-cus-01' $oldRetainedIds 'detachAll'
    Write-Host 'Moving the validated global ACS resource; phone release is not part of this operation.'
    Invoke-AzureDnsJson @('resource', 'move', '--subscription', $scope.Subscription, '--destination-group', $scope.TargetGroup, '--ids', $scope.OldAcsId) | Out-Null
    $targetAcs = Get-ConnectivityResource $scope.TargetAcsId '2025-09-01'
  }
  Assert-FullRebuildAcs $scope $targetAcs
  Write-Host 'East US resource groups and pinned images are ready. Global ACS was preserved. Deploy the new regional foundation and runtime before cleanup.'
  return
}

# Cleanup is a separate operation and cannot be invoked until the new private services and public app are ready.
Assert-FullRebuildImages $scope $scope.TargetRegistry
Assert-NoActiveWorkloadDeployment $scope.Subscription $scope.TargetGroup
foreach ($service in @(
  @('Microsoft.KeyVault/vaults/kvacmelosdeveus01v42c', '2023-07-01'),
  @('Microsoft.ManagedIdentity/userAssignedIdentities/id-acme-los-web-dev-eus-01', '2023-01-31'),
  @('Microsoft.Cache/redisEnterprise/redis-acme-los-dev-eus-01', '2025-07-01'),
  @('Microsoft.App/managedEnvironments/cae-acme-los-dev-eus-01', '2025-01-01')
)) {
  $resource = Get-ConnectivityResource "$($scope.TargetId)/providers/$($service[0])" $service[1]
  if (-not $resource -or ([string]$resource.location).Replace(' ', '') -ine 'eastus') { throw 'The new East US foundation/runtime is not ready; cleanup refused.' }
  if ($service[0] -match '/userAssignedIdentities/') {
    if (-not $resource.properties.principalId -or -not $resource.properties.clientId -or $resource.properties.tenantId -cne $scope.Tenant) { throw 'The new runtime identity is not ready.' }
  } elseif ($resource.properties.provisioningState -ine 'Succeeded') { throw 'The new East US service is not ready.' }
  if ($service[0] -match 'vaults/|redisEnterprise/') {
    if ($resource.properties.publicNetworkAccess -ine 'Disabled') { throw 'The rebuilt state services must remain private-only.' }
  }
}
$targetAcs = Get-ConnectivityResource $scope.TargetAcsId '2025-09-01'
Assert-FullRebuildAcs $scope $targetAcs
if (-not $targetAcs -or -not $targetAcs.properties.disableLocalAuth -or (Get-ConnectivityResource $scope.OldAcsId '2025-09-01')) { throw 'Preserve the global ACS resource in the target group before cleanup.' }
$targetScope = Get-DevRetirementScope $configuration $scope.Subscription $scope.PlatformSubscription
$null = Get-RetirementProtectedFingerprint $targetScope
$connectivity = @(Get-DevPrivateConnectivityPlan $configuration $scope.Subscription $scope.PlatformSubscription $scope.TargetGroup)
if ($connectivity.Count -ne 2 -or @($connectivity | Where-Object { -not $_.ready }).Count) { throw 'New private endpoints and private DNS are not ready.' }
foreach ($kind in @('web', 'bff')) {
  $appName = "ca-acme-los-$kind-dev-eus-01"
  Wait-ForContainerAppReady $scope.Subscription $scope.TargetGroup $appName
  $app = Get-ConnectivityResource "$($scope.TargetId)/providers/Microsoft.App/containerApps/$appName" '2025-01-01'
  $image = @($scope.Images | Where-Object { $_.Repository -eq $(if ($kind -eq 'web') { 'acme-los-web' } else { 'acme-los-bff-api' }) })[0]
  if ($app.properties.environmentId -ine "$($scope.TargetId)/providers/Microsoft.App/managedEnvironments/cae-acme-los-dev-eus-01" -or
    @($app.properties.template.containers).Count -ne 1 -or $app.properties.template.containers[0].image -cne "$($scope.TargetRegistry).azurecr.io/$($image.Repository)@$($image.Digest)" -or
    [bool]$app.properties.configuration.ingress.external -ne ($kind -eq 'web')) { throw 'Rebuilt apps do not match the approved image, environment, or ingress boundary.' }
  if ($kind -eq 'web') {
    $record = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', "https://management.azure.com$($dns.ZoneId)/CNAME/$($dns.HostLabel)?api-version=2018-05-01")
    if ($record.properties.CNAMERecord.cname -ine $app.properties.configuration.ingress.fqdn -or $record.properties.metadata.'acme-owner' -cne $dns.Owner) { throw 'Stable DNS does not point to the new East US web app.' }
  }
}
Wait-WebCustomDomainHealth $dns.Hostname 'dev' $scope.ImageTag.Substring(0, 8)

# Validate all old subscription scaffolds before the first deletion, including failed-resource records.
foreach ($entry in @(
  @('stk-acme-los-web-dev-cus-01', $scope.OldGroup),
  @('stk-acme-los-images-nonprod-cus-01', $scope.OldImagesGroup),
  @('stk-acme-los-web-dev-eus2-01', 'rg-acme-los-web-dev-eus2-01')
)) {
  $stack = Invoke-AzureDnsJson @('stack', 'sub', 'show', '--subscription', $scope.Subscription, '--name', $entry[0]) -AllowMissing
  if ($stack) { Assert-FullRebuildStack $stack @("/subscriptions/$($scope.Subscription)/resourceGroups/$($entry[1])") }
}

Remove-FullRebuildStack $scope $scope.PlatformSubscription 'rg-acme-hub-network-cus-01' 'stk-acme-los-dns-links-dev-cus-01' $oldLinks 'deleteResources'
Remove-FullRebuildStack $scope $scope.Subscription $scope.OldGroup 'stk-acme-los-web-app-dev-cus-01' $oldRetainedIds 'detachAll'
Remove-FullRebuildStack $scope $scope.Subscription $scope.OldImagesGroup 'stk-acme-los-images-registry-nonprod-cus-01' @($scope.OldRegistryId) 'detachAll'
foreach ($group in @($scope.OldGroup, $scope.OldImagesGroup, 'rg-acme-los-web-dev-eus2-01')) {
  $allowed = if ($group -eq $scope.OldGroup) { @(Get-FullRebuildOldWorkloadIds $scope | Where-Object { $_ -ine $scope.OldAcsId }) } elseif ($group -eq $scope.OldImagesGroup) { @($scope.OldRegistryId) } else { @() }
  $exists = Invoke-AzureDnsJson @('group', 'exists', '--subscription', $scope.Subscription, '--name', $group)
  if (-not $exists) { continue }
  $resources = @(Invoke-AzureDnsJson @('resource', 'list', '--subscription', $scope.Subscription, '--resource-group', $group) | ForEach-Object { $_ })
  Assert-FullRebuildInventory $resources $allowed
  # Only these three explicitly named workload groups can be deleted, never a shared platform group.
  Invoke-AzureDnsJson @('group', 'delete', '--subscription', $scope.Subscription, '--name', $group, '--yes') | Out-Null
}
Remove-FullRebuildStack $scope $scope.PlatformSubscription $scope.OldMonitorGroup 'stk-acme-los-monitor-dev-cus-01' $oldMonitorIds 'deleteResources'
$workbookId = @($oldMonitorIds | Where-Object { $_ -like '*/workbooks/*' })[0]
if (Get-ConnectivityResource $workbookId '2023-06-01') { Invoke-AzureDnsJson @('resource', 'delete', '--ids', $workbookId, '--api-version', '2023-06-01') | Out-Null }
foreach ($entry in @(
  @('stk-acme-los-web-dev-cus-01', $scope.OldGroup),
  @('stk-acme-los-images-nonprod-cus-01', $scope.OldImagesGroup),
  @('stk-acme-los-web-dev-eus2-01', 'rg-acme-los-web-dev-eus2-01')
)) {
  $stack = Invoke-AzureDnsJson @('stack', 'sub', 'show', '--subscription', $scope.Subscription, '--name', $entry[0]) -AllowMissing
  if ($stack) {
    Assert-FullRebuildStack $stack @("/subscriptions/$($scope.Subscription)/resourceGroups/$($entry[1])")
    Invoke-AzureDnsJson @('stack', 'sub', 'delete', '--subscription', $scope.Subscription, '--name', $entry[0], '--action-on-unmanage', 'detachAll', '--yes') | Out-Null
  }
}
Write-Host 'Old ACME LOS regional resources removed. Global DNS, ACS/phone, other applications, and purge-protected recovery records were preserved.'
