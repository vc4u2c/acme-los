Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'runtime-region.ps1')

function Assert-WebEnvironmentNotHibernated {
  param([string]$SubscriptionId, [string]$ResourceGroupName, [switch]$RecoverRetired, [string]$ExpectedRuntimeRegion)

  try {
    $group = Invoke-AzJson -Arguments @('group', 'show', '--subscription', $SubscriptionId, '--name', $ResourceGroupName)
  } catch {
    if ($_.Exception.Message -match '\(ResourceGroupNotFound\)') { return }
    throw
  }
  $retirement = if ($null -ne $group.tags) { $group.tags.PSObject.Properties['acme:retirement'] } else { $null }
  $runtimeRegion = if ($null -ne $group.tags) { $group.tags.PSObject.Properties['acme:runtime-region'] } else { $null }
  if ($ExpectedRuntimeRegion -and $runtimeRegion -and $runtimeRegion.Value -cne $ExpectedRuntimeRegion) { throw 'Runtime region differs from the recorded lifecycle; regional failback requires explicit review.' }
  if ($RecoverRetired) {
    if ($ResourceGroupName -cnotin @('rg-acme-los-web-dev-cus-01', 'rg-acme-los-web-dev-eus-01') -or
      ($ResourceGroupName -ceq 'rg-acme-los-web-dev-eus-01' -and ($ExpectedRuntimeRegion -cne 'eus' -or -not $runtimeRegion)) -or
      -not $retirement -or $retirement.Value -cne 'rebuilding') { throw 'Use the dev retirement lifecycle command to start recovery.' }
    return
  }
  if ($retirement -and $retirement.Value -ne 'active') { throw 'This environment is retired or recovery is incomplete. Use the dev retirement rebuild command.' }
  $marker = if ($null -ne $group.tags) { $group.tags.PSObject.Properties['acme:hibernated'] } else { $null }
  if ($marker -and $marker.Value -eq 'true') {
    throw 'This environment is hibernated or recovery is incomplete. Run the dev resume lifecycle command before deployment.'
  }
}

function Set-WebHibernationMarker {
  param([string]$SubscriptionId, [string]$ResourceGroupName, [bool]$Hibernated)

  Invoke-AzNoOutput -Arguments @('tag', 'update', '--resource-id', "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName", '--operation', 'Merge', '--tags', "acme:hibernated=$($Hibernated.ToString().ToLowerInvariant())", '--output', 'none')
}

function Assert-NoActiveWorkloadDeployment {
  param([string]$SubscriptionId, [string]$ResourceGroupName)

  $deployments = Invoke-AzJson -Arguments @('deployment', 'group', 'list', '--subscription', $SubscriptionId, '--resource-group', $ResourceGroupName)
  $active = @($deployments | Where-Object { $_.properties.provisioningState -notin @('Succeeded', 'Failed', 'Canceled') })
  if ($active.Count -gt 0) { throw 'A workload deployment is in progress. Wait for it to finish before changing lifecycle state.' }
}

function Get-ConnectivityResource {
  param([string]$ResourceId, [string]$ApiVersion = '2024-05-01')

  try {
    return Invoke-AzJson -Arguments @('rest', '--method', 'get', '--uri', "${ResourceId}?api-version=$ApiVersion")
  } catch {
    if ($_.Exception.Data['AzureResourceNotFound'] -eq $true) { return $null }
    $message = $_.Exception.Message
    $absent = $message -match '\((ResourceNotFound|ParentResourceNotFound)\)'
    # `az rest` wraps the ARM JSON error; typed CLI commands use a parenthesized code.
    if ($message -match '(?s)Not Found\((\{.*\})\)\s*$') {
      try {
        $armError = $Matches[1] | ConvertFrom-Json
        $absent = $armError.error.code -in @('ResourceNotFound', 'ParentResourceNotFound')
      } catch { $absent = $false }
    }
    if ($absent) {
      return $null
    }
    throw
  }
}

function Assert-ConnectivityValue {
  param($Actual, $Expected, [string]$Description)

  if ([string]::IsNullOrWhiteSpace([string]$Actual) -or [string]$Actual -ne [string]$Expected) {
    throw "Private connectivity safety check failed: $Description."
  }
}

function Get-DevPrivateConnectivityPlan {
  param($Configuration, [string]$SubscriptionId, [string]$PlatformSubscriptionId, [string]$ResourceGroupName)

  Assert-ConnectivityValue $Configuration.environments.dev.subscriptionRole 'nonprod' 'dev must use a non-production subscription role'
  $base = "$($Configuration.organizationShortName)-$($Configuration.workloadShortName)"
  $region = Get-WebRuntimeRegion $Configuration 'dev'
  $suffix = "dev-$($region.ShortName)-01"
  $foundationGroup = "rg-$base-web-dev-$($Configuration.primaryRegionShortName)-01"
  $foundationScope = "/subscriptions/$SubscriptionId/resourceGroups/$foundationGroup"
  if ($region.Relocated) { Assert-ConnectivityValue $ResourceGroupName (Get-WebRuntimeResourceGroupName $Configuration 'dev') 'regional runtime group' }
  $scope = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName"
  $networkScope = "/subscriptions/$PlatformSubscriptionId/resourceGroups/$($Configuration.platformResources.networkResourceGroupName)"
  $vnetId = "$scope/providers/Microsoft.Network/virtualNetworks/vnet-$base-web-$suffix"
  $subnetId = "$vnetId/subnets/snet-$base-data-$suffix"
  $stack = Invoke-AzJson -Arguments @('stack', 'group', 'show', '--subscription', $SubscriptionId, '--resource-group', $foundationGroup, '--name', "stk-$base-web-app-dev-$($Configuration.primaryRegionShortName)-01")
  $retainedStack = $stack
  $parameters = $stack.PSObject.Properties['parameters']
  $phase = if ($parameters) { $parameters.Value.PSObject.Properties['resourcePhase'] } else { $null }
  if ($phase -and $phase.Value.value -eq 'retained') {
    $stack = Invoke-AzJson -Arguments @('stack', 'group', 'show', '--subscription', $SubscriptionId, '--resource-group', $ResourceGroupName, '--name', "stk-$base-web-disposable-$suffix")
    Assert-ConnectivityValue $stack.parameters.resourcePhase.value 'disposable' 'private endpoints must be owned by the disposable stack'
    Assert-ConnectivityValue $retainedStack.provisioningState 'succeeded' 'retained stack must be ready'
    Assert-ConnectivityValue $retainedStack.denySettings.mode 'none' 'retained stack deny settings'
  }
  Assert-ConnectivityValue $stack.provisioningState 'succeeded' 'infrastructure stack must not be deploying or failed'
  Assert-ConnectivityValue $stack.denySettings.mode 'none' 'do not bypass stack deny settings'
  Assert-ConnectivityValue $stack.outputs.workloadVirtualNetworkId.value $vnetId 'workload VNet must match the deployed stack'
  Assert-ConnectivityValue $stack.outputs.dataSubnetName.value "snet-$base-data-$suffix" 'data subnet must match the deployed stack'
  $subnet = Get-ConnectivityResource $subnetId
  if (-not $subnet) { throw 'The private endpoint subnet is missing.' }

  $definitions = @(
    @{
      role = 'kv'; targetName = "kv$($Configuration.organizationShortName)$($Configuration.workloadShortName)dev$($Configuration.primaryRegionShortName)01$($Configuration.resourceNameSuffix)"
      targetType = 'Microsoft.KeyVault/vaults'; apiVersion = '2023-07-01'; groupId = 'vault'
      zone = $Configuration.platformResources.privateDnsZones.keyVault; output = 'keyVaultId'
    }
    @{
      role = 'redis'; targetName = "redis-$base-$suffix"
      targetType = 'Microsoft.Cache/redisEnterprise'; apiVersion = '2025-07-01'; groupId = 'redisEnterprise'
      zone = $Configuration.platformResources.privateDnsZones.managedRedis; output = 'redisClusterId'
    }
  )

  foreach ($definition in $definitions) {
    $name = "pep-$base-$($definition.role)-$suffix"
    $id = "$scope/providers/Microsoft.Network/privateEndpoints/$name"
    $targetScope = if ($definition.role -eq 'kv') { $foundationScope } else { $scope }
    $targetId = "$targetScope/providers/$($definition.targetType)/$($definition.targetName)"
    $zoneId = "$networkScope/providers/Microsoft.Network/privateDnsZones/$($definition.zone)"
    Assert-ConnectivityValue $stack.outputs.PSObject.Properties[$definition.output].Value.value $targetId 'service ID must match the deployed stack'
    foreach ($ownedId in @($id, "$id/privateDnsZoneGroups/default")) {
      if (@($stack.resources | ForEach-Object { $_.id }) -notcontains $ownedId) { throw "The infrastructure stack does not own '$ownedId'." }
    }
    $serviceStack = if ($definition.role -eq 'kv') { $retainedStack } else { $stack }
    if (@($serviceStack.resources | ForEach-Object { $_.id }) -notcontains $targetId) { throw "The infrastructure stack does not own '$targetId'." }
    $target = Get-ConnectivityResource $targetId $definition.apiVersion
    if (-not $target) { throw "Retained service '$targetId' is missing. Hibernation never creates or deletes services." }
    $targetLocation = if ($definition.role -eq 'kv') { $Configuration.primaryLocation } else { $region.Location }
    Assert-ConnectivityValue ($target.location -replace ' ', '') $targetLocation 'service region'
    Assert-ConnectivityValue $target.properties.publicNetworkAccess 'Disabled' 'retained services must remain private-only'
    Assert-ConnectivityValue $target.tags.'acme:environment' 'dev' 'retained service must be tagged dev'
    $zone = Get-ConnectivityResource $zoneId '2024-06-01'
    if (-not $zone) { throw "Shared private DNS zone '$zoneId' is missing." }
    $links = Invoke-AzJson -Arguments @('rest', '--method', 'get', '--uri', "$zoneId/virtualNetworkLinks?api-version=2024-06-01")
    $validLinks = @($links.value | Where-Object {
      $_.properties.virtualNetwork.id -eq $vnetId -and $_.properties.provisioningState -eq 'Succeeded' -and $_.properties.virtualNetworkLinkState -eq 'Completed'
    })
    if ($validLinks.Count -ne 1) { throw "Shared private DNS zone '$zoneId' must have a completed workload VNet link." }

    $recordName = if ($definition.role -eq 'redis') { "$($definition.targetName).$($region.Location)" } else { $definition.targetName }
    $entry = [pscustomobject]@{
      name = $name; id = $id; targetId = $targetId; targetApiVersion = $definition.apiVersion
      zoneId = $zoneId; recordName = $recordName; subscriptionId = $SubscriptionId; resourceGroupName = $ResourceGroupName
      deploymentName = "pep-$($definition.role)-dev"
      parameters = @{
        name = @{ value = $name }; location = @{ value = $region.Location }
        subnetId = @{ value = $subnetId }; privateLinkServiceId = @{ value = $targetId }
        groupIds = @{ value = @($definition.groupId) }; connectionName = @{ value = "$name-conn" }
        customNetworkInterfaceName = @{ value = "nic-$base-$($definition.role)-$suffix" }
        tags = @{ value = $target.tags }; privateDnsZoneIds = @{ value = @($zoneId) }
      }
      exists = $false; ready = $false
    }
    Update-PrivateConnectivityState $entry
    $entry
  }
}

function Update-PrivateConnectivityState {
  param($Entry)

  $Entry.ready = $false
  $endpoint = Get-ConnectivityResource $Entry.id
  $Entry.exists = $null -ne $endpoint
  if (-not $endpoint) { return }

  Assert-ConnectivityValue $endpoint.id $Entry.id 'endpoint identity'
  Assert-ConnectivityValue $endpoint.location $Entry.parameters.location.value 'endpoint location'
  Assert-ConnectivityValue $endpoint.properties.subnet.id $Entry.parameters.subnetId.value 'endpoint subnet'
  Assert-ConnectivityValue $endpoint.properties.customNetworkInterfaceName $Entry.parameters.customNetworkInterfaceName.value 'endpoint NIC name'
  Assert-ConnectivityValue $endpoint.tags.'acme:environment' 'dev' 'endpoint environment tag'
  $connections = @($endpoint.properties.privateLinkServiceConnections)
  if ($connections.Count -ne 1 -or @($endpoint.properties.manualPrivateLinkServiceConnections).Count -ne 0 -or @($endpoint.properties.ipConfigurations).Count -ne 0) {
    throw 'Only the source-owned, dynamically addressed endpoint with one automatic connection can be hibernated.'
  }
  Assert-ConnectivityValue $connections[0].properties.privateLinkServiceId $Entry.targetId 'endpoint service target'
  Assert-ConnectivityValue $connections[0].name $Entry.parameters.connectionName.value 'endpoint connection name'
  if (@($connections[0].properties.groupIds).Count -ne 1) { throw 'Unexpected endpoint group IDs.' }
  Assert-ConnectivityValue $connections[0].properties.groupIds[0] $Entry.parameters.groupIds.value[0] 'endpoint service group'
  $Entry.parameters.tags.value = $endpoint.tags

  $zoneGroups = Invoke-AzJson -Arguments @('rest', '--method', 'get', '--uri', "$($Entry.id)/privateDnsZoneGroups?api-version=2024-05-01")
  if (@($zoneGroups.value).Count -gt 1) { throw 'Unexpected additional private DNS zone groups.' }
  if (@($zoneGroups.value).Count -eq 0) { return }
  $zoneGroup = @($zoneGroups.value)[0]
  Assert-ConnectivityValue $zoneGroup.name 'default' 'endpoint DNS zone group name'
  $zones = @($zoneGroup.properties.privateDnsZoneConfigs)
  if ($zones.Count -ne 1) { throw 'Unexpected private DNS zones; refusing to alter another service registration.' }
  Assert-ConnectivityValue $zones[0].properties.privateDnsZoneId $Entry.zoneId 'endpoint private DNS zone'

  if ($endpoint.properties.provisioningState -ne 'Succeeded' -or $connections[0].properties.privateLinkServiceConnectionState.status -ne 'Approved' -or $zoneGroup.properties.provisioningState -ne 'Succeeded') { return }
  $nicId = "$($Entry.id.Substring(0, $Entry.id.IndexOf('/providers/')))/providers/Microsoft.Network/networkInterfaces/$($Entry.parameters.customNetworkInterfaceName.value)"
  if (@($endpoint.properties.networkInterfaces).Count -ne 1) { throw 'Unexpected endpoint NIC count.' }
  Assert-ConnectivityValue $endpoint.properties.networkInterfaces[0].id $nicId 'endpoint NIC identity'
  $nic = Get-ConnectivityResource $nicId
  $record = Get-ConnectivityResource "$($Entry.zoneId)/A/$($Entry.recordName)" '2024-06-01'
  if (-not $nic -or -not $record) { return }
  $addresses = @($nic.properties.ipConfigurations | ForEach-Object { $_.properties.privateIPAddress })
  $dnsAddresses = @($record.properties.aRecords | ForEach-Object { $_.ipv4Address })
  $Entry.ready = $addresses.Count -gt 0 -and $addresses.Count -eq $dnsAddresses.Count -and @($addresses | Where-Object { $_ -notin $dnsAddresses }).Count -eq 0
}

function Invoke-PrivateConnectivityDeployment {
  param($Entry, [ValidateSet('validate', 'create')][string]$Action)

  # Reuse the owning stack's module. Never redeploy the full stack or change its managed-resource list here.
  $template = Join-Path $PSScriptRoot '../../../infra/azure/bicep/modules/network/private-endpoint.bicep'
  $parameterFile = [IO.Path]::GetTempFileName()
  try {
    @{ parameters = $Entry.parameters } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $parameterFile -Encoding UTF8
    Invoke-AzNoOutput -Arguments @(
      'deployment', 'group', $Action, '--subscription', $Entry.subscriptionId,
      '--resource-group', $Entry.resourceGroupName, '--name', $Entry.deploymentName,
      '--mode', 'Incremental', '--template-file', $template, '--parameters', "@$parameterFile", '--output', 'none'
    )
  } finally {
    Remove-Item -LiteralPath $parameterFile -Force
  }
}

function Assert-PrivateConnectivityTemplate {
  $template = Join-Path $PSScriptRoot '../../../infra/azure/bicep/modules/network/private-endpoint.bicep'
  $compiled = Invoke-AzJson -Arguments @('bicep', 'build', '--file', $template, '--stdout')
  $types = @($compiled.resources | ForEach-Object { $_.type })
  if ($types.Count -ne 2 -or $types -notcontains 'Microsoft.Network/privateEndpoints' -or $types -notcontains 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups') {
    throw 'The recovery template must contain only a private endpoint and its DNS zone group.'
  }
}

function Remove-DevPrivateConnectivity {
  param([object[]]$Plan, [object[]]$ContainerApps, $Operations)

  foreach ($entry in $Plan) {
    # Recheck both apps and the endpoint immediately before each destructive operation.
    foreach ($app in $ContainerApps) {
      $state = Get-ContainerAppState -SubscriptionId $entry.subscriptionId -ResourceGroupName $entry.resourceGroupName -ContainerAppName $app.name
      if (-not $state -or $state.properties.runningStatus -ne 'Stopped') { throw 'Both container apps must be verified Stopped before deleting any endpoint.' }
    }
    Update-PrivateConnectivityState $entry
    if (-not $entry.exists) { continue }
    Invoke-AzNoOutput -Arguments @('network', 'private-endpoint', 'delete', '--ids', $entry.id, '--output', 'none')
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      Update-PrivateConnectivityState $entry
      if (-not $entry.exists) { break }
      Start-Sleep -Seconds 5
    }
    if ($entry.exists) { throw "Timed out deleting '$($entry.name)'. Apps remain stopped; retry hibernate or resume." }
    [void]$Operations.Add("deleted-private-endpoint:$($entry.name)")
  }
}

function Restore-DevPrivateConnectivity {
  param([object[]]$Plan, $Operations)

  foreach ($entry in $Plan) {
    if (-not $entry.ready) {
      Invoke-PrivateConnectivityDeployment $entry 'create'
      [void]$Operations.Add("restored-private-endpoint:$($entry.name)")
    }
  }
  foreach ($entry in $Plan) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      Update-PrivateConnectivityState $entry
      if ($entry.ready) { break }
      Start-Sleep -Seconds 5
    }
    if (-not $entry.ready) { throw "Private endpoint '$($entry.name)' is not approved with matching private DNS. Apps have not been started." }
  }
}

function Wait-ForWorkloadHealth {
  param([string]$Fqdn)

  if ($Fqdn -notmatch '^[a-z0-9.-]+\.azurecontainerapps\.io$') { throw 'Unexpected ACA health hostname.' }
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "https://$Fqdn/api/health" -TimeoutSec 20 -MaximumRedirection 0
      $health = $response.Content | ConvertFrom-Json
      if ($response.StatusCode -eq 200 -and $health.status -eq 'ok' -and $health.service -eq 'web-app' -and $health.layers.bff.status -eq 'ok') { return }
    } catch { }
    Start-Sleep -Seconds 10
  }
  throw 'The public web + BFF health check did not pass. Alerts remain disabled; inspect the apps before retrying resume.'
}

function Wait-ForContainerAppReady {
  param([string]$SubscriptionId, [string]$ResourceGroupName, [string]$Name)

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $revisions = Invoke-AzJson -Arguments @('containerapp', 'revision', 'list', '--subscription', $SubscriptionId, '--resource-group', $ResourceGroupName, '--name', $Name)
    $active = @($revisions | Where-Object { $_.properties.active })
    $unready = @($active | Where-Object {
      $_.properties.healthState -ne 'Healthy' -or $_.properties.runningState -notin @('Running', 'RunningAtMaxScale') -or $_.properties.replicas -lt 1
    })
    if ($active.Count -gt 0 -and $unready.Count -eq 0) { return }
    Start-Sleep -Seconds 10
  }
  throw "Container app '$Name' has not passed replica readiness. Alerts remain disabled."
}
