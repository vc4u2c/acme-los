Set-StrictMode -Version Latest

function Get-FullRegionalRebuildScope {
  param($Configuration)
  if ($Configuration.projectName -cne 'acme-los' -or $Configuration.primaryLocation -cne 'eastus' -or
    $Configuration.primaryRegionShortName -cne 'eus' -or $Configuration.environments.dev.subscriptionRole -cne 'nonprod' -or
    $Configuration.environments.dev.PSObject.Properties['runtimeRegion'] -or
    $Configuration.environments.dev.smsMfa.resourceName -cne 'acs-acme-los-dev-cus-01' -or
    $Configuration.platformResources.monitorResourceGroupName -cne 'rg-acme-hub-monitor-eus-01' -or
    $Configuration.platformResources.networkResourceGroupName -cne 'rg-acme-hub-network-cus-01' -or
    $Configuration.platformResources.publicDnsResourceGroupName -cne 'rg-acme-los-dns-cus-01') {
    throw 'Full rebuild is restricted to the reviewed ACME LOS dev East US configuration, preserving global DNS and ACS.'
  }
  $sub = '7df9ce70-48a3-4495-9361-4ca7b2637748'
  $platform = 'b582269b-60ff-4bb0-b30b-6fb2796edf11'
  $old = "/subscriptions/$sub/resourceGroups/rg-acme-los-web-dev-cus-01"
  $target = "/subscriptions/$sub/resourceGroups/rg-acme-los-web-dev-eus-01"
  [pscustomobject]@{
    Subscription = $sub; PlatformSubscription = $platform; Tenant = '73521cbe-9858-4230-996d-319b8074e103'
    OldGroup = 'rg-acme-los-web-dev-cus-01'; TargetGroup = 'rg-acme-los-web-dev-eus-01'
    OldId = $old; TargetId = $target
    OldImagesGroup = 'rg-acme-los-images-nonprod-cus-01'; TargetImagesGroup = 'rg-acme-los-images-nonprod-eus-01'
    OldRegistry = 'acracmelosnonprodcus01v42c'; TargetRegistry = 'acracmelosnonprodeus01v42c'
    OldRegistryId = "/subscriptions/$sub/resourceGroups/rg-acme-los-images-nonprod-cus-01/providers/Microsoft.ContainerRegistry/registries/acracmelosnonprodcus01v42c"
    OldAcsId = "$old/providers/Microsoft.Communication/communicationServices/acs-acme-los-dev-cus-01"
    TargetAcsId = "$target/providers/Microsoft.Communication/communicationServices/acs-acme-los-dev-cus-01"
    AcsImmutableId = 'b2928de8-415b-47b7-a6ae-571792f41a49'
    AcsHostName = 'acs-acme-los-dev-cus-01.unitedstates.communication.azure.com'
    OldMonitorGroup = 'rg-acme-hub-monitor-cus-01'; TargetMonitorGroup = 'rg-acme-hub-monitor-eus-01'
    ImageTag = '2519e1dd00248d316823eb6831f71ff7bea4e819-dev'
    Images = @(
      @{ Repository = 'acme-los-web'; Digest = 'sha256:56b8ea3daede9d4fe07f2484879b34d02e184bbed35c2958f4b842bb839b9bba' },
      @{ Repository = 'acme-los-bff-api'; Digest = 'sha256:66df7f0f76091a25fe62588d114768f1b6bdafe0dc493593fa60f21d6b30102c' }
    )
  }
}

function Assert-FullRebuildInventory {
  param($Resources, [string[]]$AllowedIds)
  foreach ($resource in @($Resources)) {
    if ($resource.id -notin $AllowedIds) { throw "Unexpected resource outside the approved rebuild inventory: $($resource.id)" }
  }
}

function Get-FullRebuildOldWorkloadIds {
  param($Scope)
  $base = "$($Scope.OldId)/providers"
  @(
    "$base/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01",
    "$base/Microsoft.Network/networkSecurityGroups/nsg-acme-los-app-dev-cus-01",
    "$base/Microsoft.Network/networkSecurityGroups/nsg-acme-los-data-dev-cus-01",
    "$base/Microsoft.ManagedIdentity/userAssignedIdentities/id-acme-los-web-dev-cus-01",
    "$base/Microsoft.KeyVault/vaults/kvacmelosdevcus01v42c",
    "$base/Microsoft.Insights/actionGroups/Application Insights Smart Detection",
    $Scope.OldAcsId
  )
}

function Get-FullRebuildOldMonitoringIds {
  param($Scope)
  $base = "/subscriptions/$($Scope.PlatformSubscription)/resourceGroups/$($Scope.OldMonitorGroup)/providers"
  @(
    "$base/Microsoft.Insights/actionGroups/ag-acme-los-ops-dev-cus-01",
    "$base/Microsoft.Insights/components/appi-acme-los-dev-cus-01",
    "$base/Microsoft.OperationalInsights/workspaces/log-acme-los-dev-cus-01",
    "$base/Microsoft.Insights/workbooks/01808dbe-674e-563b-8290-9d97291a0948"
  )
  foreach ($kind in @('system-errors', 'auth-failures', 'exceptions', 'failed-requests')) {
    "$base/Microsoft.Insights/scheduledQueryRules/alrt-acme-los-$kind-dev-cus-01"
  }
}

function Assert-FullRebuildStack {
  param($Stack, [string[]]$AllowedIds)
  if ($Stack.provisioningState -notin @('succeeded', 'failed', 'canceled') -or $Stack.denySettings.mode -ine 'none') { throw 'Rebuild requires a terminal stack without deny settings.' }
  Assert-FullRebuildInventory $Stack.resources $AllowedIds
  $failed = $Stack.PSObject.Properties['failedResources']
  if ($failed -and $failed.Value) { Assert-FullRebuildInventory $failed.Value $AllowedIds }
}

function Assert-FullRebuildImages {
  param($Scope, [string]$Registry)
  foreach ($entry in $Scope.Images) {
    $image = Invoke-AzureDnsJson @('acr', 'manifest', 'show-metadata', '--subscription', $Scope.Subscription, '--registry', $Registry, '--name', "$($entry.Repository):$($Scope.ImageTag)")
    if ($image.digest -cne $entry.Digest) { throw 'The regional rebuild image digest does not match the approved release.' }
  }
}

function Assert-FullRebuildAcs {
  param($Scope, $Resource)
  if (-not $Resource -or $Resource.id -notin @($Scope.OldAcsId, $Scope.TargetAcsId) -or
    $Resource.location -ine 'global' -or -not $Resource.properties.disableLocalAuth -or
    $Resource.properties.immutableResourceId -cne $Scope.AcsImmutableId -or
    $Resource.properties.hostName -cne $Scope.AcsHostName -or
    $Resource.properties.dataLocation -cne 'United States' -or $Resource.tags.'acme:application' -cne 'acme-los') {
    throw 'The global ACS resource failed immutable identity, ownership, or security checks.'
  }
}

function Assert-FullRebuildMove {
  param($Scope)
  $token = Invoke-AzureDnsJson @('account', 'get-access-token', '--subscription', $Scope.Subscription, '--resource', 'https://management.azure.com/')
  $headers = @{ Authorization = "Bearer $($token.accessToken)" }
  $body = @{ resources = @($Scope.OldAcsId); targetResourceGroup = $Scope.TargetId } | ConvertTo-Json -Compress
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://management.azure.com$($Scope.OldId)/validateMoveResources?api-version=2021-04-01" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 120 -MaximumRedirection 0
    $pollLocation = $response.Headers['Location']
    for ($attempt = 0; $attempt -lt 120 -and $response.StatusCode -eq 202; $attempt++) {
      $uri = [uri]$pollLocation
      if ($uri.Scheme -cne 'https' -or $uri.Host -cne 'management.azure.com' -or $uri.UserInfo) { throw 'Unsafe Azure validation continuation.' }
      Start-Sleep -Seconds 5
      $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $uri.AbsoluteUri -Headers $headers -TimeoutSec 120 -MaximumRedirection 0
    }
    if ($response.StatusCode -ne 204) { throw 'Move validation did not complete.' }
  } catch { throw 'ACS move validation did not succeed. The retained foundation stack was not detached; inspect Azure move diagnostics.' }
}

function Assert-FullRebuildTargetStack {
  param($Scope, [ValidateSet('sub', 'group')][string]$Level, [string]$Name, [string]$Group, [string[]]$AllowedIds)
  $arguments = @('stack', $Level, 'show', '--subscription', $Scope.Subscription, '--name', $Name)
  if ($Level -eq 'group') { $arguments += @('--resource-group', $Group) }
  $stack = Invoke-AzureDnsJson $arguments -AllowMissing
  if (-not $stack) { return }
  Assert-FullRebuildStack $stack $AllowedIds
  foreach ($pair in @(@('regionShortName', 'eus'), @('location', 'eastus'))) {
    if ($stack.parameters.($pair[0]).value -cne $pair[1]) { throw 'Existing target stack does not match the approved East US rebuild.' }
  }
}

function Remove-FullRebuildStack {
  param($Scope, [string]$SubscriptionId, [string]$Group, [string]$Name, [string[]]$AllowedIds, [ValidateSet('detachAll', 'deleteResources')][string]$Action)
  $stack = Invoke-AzureDnsJson @('stack', 'group', 'show', '--subscription', $SubscriptionId, '--resource-group', $Group, '--name', $Name) -AllowMissing
  if (-not $stack) { return }
  Assert-FullRebuildStack $stack $AllowedIds
  Invoke-AzureDnsJson @('stack', 'group', 'delete', '--subscription', $SubscriptionId, '--resource-group', $Group, '--name', $Name, '--action-on-unmanage', $Action, '--yes') | Out-Null
}
