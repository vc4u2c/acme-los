Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'runtime-region.ps1')

function Get-DevRetirementScope {
  param($Configuration, [string]$SubscriptionId, [string]$PlatformSubscriptionId)
  if ($Configuration.projectName -cne 'acme-los' -or $Configuration.primaryRegionShortName -cne 'cus' -or
    $Configuration.environments.dev.subscriptionRole -cne 'nonprod' -or $SubscriptionId -eq $PlatformSubscriptionId) {
    throw 'Retirement is restricted to the ACME LOS dev non-production workload.'
  }
  foreach ($id in @($SubscriptionId, $PlatformSubscriptionId)) {
    if ($id -notmatch '^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$') { throw 'Explicit subscription GUIDs are required.' }
  }
  $region = Get-WebRuntimeRegion $Configuration 'dev'
  $short = $region.ShortName
  $group = "rg-acme-los-web-dev-$short-01"
  $scope = "/subscriptions/$SubscriptionId/resourceGroups/$group"
  $foundationGroup = 'rg-acme-los-web-dev-cus-01'
  $foundation = "/subscriptions/$SubscriptionId/resourceGroups/$foundationGroup"
  return [pscustomobject]@{
    Subscription = $SubscriptionId; PlatformSubscription = $PlatformSubscriptionId; Group = $group; Id = $scope
    FoundationGroup = $foundationGroup; FoundationId = $foundation; Region = $short; Location = $region.Location; Relocated = $region.Relocated
    RetainedStack = 'stk-acme-los-web-app-dev-cus-01'; DisposableStack = "stk-acme-los-web-disposable-dev-$short-01"
    EnvironmentId = "$scope/providers/Microsoft.App/managedEnvironments/cae-acme-los-dev-$short-01"
    RedisId = "$scope/providers/Microsoft.Cache/redisEnterprise/redis-acme-los-dev-$short-01"
    VaultId = "$foundation/providers/Microsoft.KeyVault/vaults/kvacmelosdevcus01v42c"
    IdentityId = "$foundation/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-acme-los-web-dev-cus-01"
    AcsId = "$foundation/providers/Microsoft.Communication/communicationServices/acs-acme-los-dev-cus-01"
    InfrastructureGroup = "rg-acme-los-cae-infra-dev-$short-01"
    Registry = 'acracmelosnonprodcus01v42c'
    RegistryId = "/subscriptions/$SubscriptionId/resourceGroups/rg-acme-los-images-nonprod-cus-01/providers/Microsoft.ContainerRegistry/registries/acracmelosnonprodcus01v42c"
    AppNames = @("ca-acme-los-web-dev-$short-01", "ca-acme-los-bff-dev-$short-01")
  }
}

function Get-DevDisposableResourceIds {
  param($Scope)
  $disposable = @(
    $Scope.EnvironmentId, "$($Scope.EnvironmentId)/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-cae-dev-$($Scope.Region)-01",
    $Scope.RedisId, "$($Scope.RedisId)/databases/default",
    "$($Scope.RedisId)/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-redis-dev-$($Scope.Region)-01"
  )
  foreach ($kind in @('kv', 'redis')) {
    $endpoint = "$($Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-$($Scope.Region)-01"
    $disposable += @($endpoint, "$endpoint/privateDnsZoneGroups/default")
  }
  if ($Scope.Relocated) {
    $network = "$($Scope.Id)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-$($Scope.Region)-01"
    $disposable += @($network)
    foreach ($kind in @('app', 'data')) {
      $disposable += @("$network/subnets/snet-acme-los-$kind-dev-$($Scope.Region)-01", "$($Scope.Id)/providers/Microsoft.Network/networkSecurityGroups/nsg-acme-los-$kind-dev-$($Scope.Region)-01")
    }
  }
  return $disposable
}

function Get-RetirementResourceClass {
  param($Scope, [string]$Id)
  $disposable = @(Get-DevDisposableResourceIds $Scope)
  if ($disposable -contains $Id -or $Id -match ('^' + [regex]::Escape($Scope.RedisId) + '/databases/default/accessPolicyAssignments/aparedis[a-z0-9]+$')) { return 'disposable' }
  $network = "$($Scope.FoundationId)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01"
  $retained = @($Scope.VaultId, $Scope.IdentityId, $Scope.AcsId, $network,
    "$network/subnets/snet-acme-los-app-dev-cus-01", "$network/subnets/snet-acme-los-data-dev-cus-01",
    "$($Scope.FoundationId)/providers/Microsoft.Network/networkSecurityGroups/nsg-acme-los-app-dev-cus-01",
    "$($Scope.FoundationId)/providers/Microsoft.Network/networkSecurityGroups/nsg-acme-los-data-dev-cus-01",
    "$($Scope.VaultId)/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-kv-dev-cus-01")
  if ($retained -contains $Id) { return 'retained' }
  foreach ($parent in @($Scope.VaultId, $Scope.AcsId, $Scope.RegistryId)) {
    if ($Id -match ('^' + [regex]::Escape($parent) + '/providers/Microsoft.Authorization/roleAssignments/[a-f0-9-]{36}$')) { return 'retained' }
  }
  throw "Unexpected stack resource '$Id'; no deletion is authorized."
}

function Assert-RetirementStack {
  param($Scope, $Stack, [ValidateSet('all', 'retained', 'disposable')][string]$Phase, [switch]$AllowFailed, [switch]$AllowPartial)
  $acceptedStates = @('succeeded')
  if ($AllowFailed) { $acceptedStates += @('failed', 'canceled') }
  if (-not $Stack -or $Stack.provisioningState -notin $acceptedStates -or $Stack.denySettings.mode -ine 'none') { throw 'Stack must be succeeded with no deny settings before a lifecycle operation; an explicit interrupted recovery may retry terminal failures.' }
  $expectedName = if ($Phase -eq 'disposable') { $Scope.DisposableStack } else { $Scope.RetainedStack }
  $stackScope = if ($Phase -eq 'disposable') { $Scope.Id } else { $Scope.FoundationId }
  if ($Stack.id -ine "$stackScope/providers/Microsoft.Resources/deploymentStacks/$expectedName") { throw 'Unexpected stack scope.' }
  $failedProperty = $Stack.PSObject.Properties['failedResources']
  $failed = @(if ($failedProperty) { $failedProperty.Value })
  $emptyFailedRecovery = $AllowFailed -and $AllowPartial -and $Stack.provisioningState -in @('failed', 'canceled')
  if ($failed.Count -gt 0 -and -not $emptyFailedRecovery) { throw 'Failed-resource records require explicit terminal-failure recovery.' }
  foreach ($entry in @($Stack.resources) + $failed) {
    $class = Get-RetirementResourceClass $Scope $entry.id
    if ($Phase -ne 'all' -and $class -ne $Phase) { throw "The $Phase stack owns a $class resource; refusing lifecycle changes." }
  }
  if (@($Stack.resources).Count -eq 0 -and -not $emptyFailedRecovery) { throw 'Refusing to operate on an empty or incomplete stack.' }
  $ids = @($Stack.resources | ForEach-Object { $_.id })
  if (-not $AllowPartial -and $Phase -in @('all', 'disposable')) {
    foreach ($required in @(Get-DevDisposableResourceIds $Scope)) {
      if ($ids -notcontains $required) { throw "Incomplete disposable ownership: '$required' is missing." }
    }
    $policies = @($ids | Where-Object { $_ -match ('^' + [regex]::Escape($Scope.RedisId) + '/databases/default/accessPolicyAssignments/aparedis[a-z0-9]+$') })
    if ($policies.Count -ne 1) { throw 'Exactly one source-owned Redis identity policy must belong to the disposable stack.' }
  }
  if (-not $AllowPartial -and $Phase -in @('all', 'retained')) {
    foreach ($required in @($Scope.VaultId, $Scope.IdentityId, $Scope.AcsId, "$($Scope.FoundationId)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01")) {
      if ($ids -notcontains $required) { throw "Incomplete retained ownership: '$required' is missing." }
    }
    foreach ($parent in @($Scope.VaultId, $Scope.AcsId, $Scope.RegistryId)) {
      $roles = @($ids | Where-Object { $_ -match ('^' + [regex]::Escape($parent) + '/providers/Microsoft.Authorization/roleAssignments/[a-f0-9-]{36}$') })
      if ($roles.Count -ne 1) { throw 'Each retained service must retain its single source-owned identity role assignment.' }
    }
  }
  $region = if ($Phase -eq 'disposable') { $Scope.Region } else { 'cus' }
  foreach ($pair in @(@('environmentName', 'dev'), @('organizationShortName', 'acme'), @('workloadShortName', 'los'), @('regionShortName', $region), @('instanceNumber', '01'), @('uniqueShortSuffix', 'v42c'), @('stateStoreMode', 'redis'), @('platformSubscriptionId', $Scope.PlatformSubscription))) {
    $property = $Stack.parameters.PSObject.Properties[$pair[0]]
    if (-not $property -or $property.Value.value -cne $pair[1]) { throw "Unexpected stack parameter $($pair[0])." }
  }
}

function Get-RetirementStack {
  param($Scope, [string]$Name)
  $group = if ($Name -eq $Scope.RetainedStack) { $Scope.FoundationGroup } else { $Scope.Group }
  $stacks = @(Invoke-AzureDnsJson @('stack', 'group', 'list', '--subscription', $Scope.Subscription, '--resource-group', $group) -AllowMissing | ForEach-Object { $_ })
  return $stacks | Where-Object { $null -ne $_ -and $_.name -eq $Name } | Select-Object -First 1
}

function Invoke-RetirementPhase {
  param($Scope, $Parameters, [ValidateSet('retained', 'disposable')][string]$Phase, [switch]$ValidateOnly)
  $values = @{}
  foreach ($property in $Parameters.PSObject.Properties) {
    $reference = $property.Value.PSObject.Properties['reference']
    if ($property.Value.type -notin @('string', 'int', 'bool', 'object', 'array') -or ($reference -and $reference.Value)) { throw 'Retirement never exports secret-bearing stack parameters.' }
    $values[$property.Name] = @{ value = $property.Value.value }
  }
  $values.resourcePhase = @{ value = $Phase }
  $file = [IO.Path]::GetTempFileName()
  try {
    @{ parameters = $values } | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $file -Encoding UTF8
    $template = Join-Path $PSScriptRoot '../../../infra/azure/bicep/main.web.rg.bicep'
    $arguments = @('--subscription', $Scope.Subscription, '--resource-group', $Scope.Group, '--template-file', $template, '--parameters', "@$file")
    if ($ValidateOnly) {
      Invoke-AzureDnsJson (@('deployment', 'group', 'validate', '--name', "retirement-validate-$Phase") + $arguments) | Out-Null
    } else {
      $name = if ($Phase -eq 'retained') { $Scope.RetainedStack } else { $Scope.DisposableStack }
      # Ownership migration never deletes unmanaged resources, including on retry.
      Invoke-AzureDnsJson (@('stack', 'group', 'create', '--name', $name, '--action-on-unmanage', 'detachAll', '--deny-settings-mode', 'none', '--yes') + $arguments) | Out-Null
    }
  } finally { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
}

function Get-RetirementProtectedFingerprint {
  param($Scope)
  $vault = Get-ConnectivityResource $Scope.VaultId '2023-07-01'
  $identity = Get-ConnectivityResource $Scope.IdentityId '2023-01-31'
  $acs = Get-ConnectivityResource $Scope.AcsId '2025-09-01'
  if (-not $vault -or -not $identity -or -not $acs -or $vault.properties.publicNetworkAccess -ne 'Disabled' -or -not $acs.properties.disableLocalAuth) { throw 'A retained service is missing or its security settings changed.' }
  $secretPath = "$($Scope.VaultId)/secrets"
  $next = "https://management.azure.com${secretPath}?api-version=2023-07-01"
  $seen = @{}
  $secretVersions = @()
  while ($next) {
    $uri = [uri]$next
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'management.azure.com' -or $uri.AbsolutePath -ine $secretPath -or $seen.ContainsKey($next) -or $seen.Count -ge 100) { throw 'Unsafe or repeated secret metadata pagination link.' }
    $seen[$next] = $true
    # Windows PowerShell invokes az.cmd; protect continuation-query ampersands from cmd parsing.
    $requestUri = if ($PSVersionTable.PSEdition -eq 'Desktop' -and $next.Contains('&')) { '"' + $next + '"' } else { $next }
    $secrets = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', $requestUri)
    $secretVersions += @($secrets.value | ForEach-Object { $_.properties.secretUriWithVersion })
    $next = if ($secrets.PSObject.Properties['nextLink']) { [string]$secrets.nextLink } else { '' }
  }
  $secretVersions = @($secretVersions | Sort-Object)
  if ($secretVersions.Count -lt 4 -or @($secretVersions | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count) { throw 'Retained secret metadata is incomplete.' }
  $payload = [ordered]@{ vault = $vault.id; tenant = $vault.properties.tenantId; identity = $identity.properties.principalId; client = $identity.properties.clientId; acs = $acs.id; secrets = $secretVersions } | ConvertTo-Json -Depth 6 -Compress
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload)))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
}

function Assert-RetiredCentralRuntime {
  param($Scope)
  foreach ($entry in @(
    @('Microsoft.App/managedEnvironments/cae-acme-los-dev-cus-01', '2025-01-01'),
    @('Microsoft.App/containerApps/ca-acme-los-web-dev-cus-01', '2025-01-01'),
    @('Microsoft.App/containerApps/ca-acme-los-bff-dev-cus-01', '2025-01-01'),
    @('Microsoft.Cache/redisEnterprise/redis-acme-los-dev-cus-01', '2025-07-01'),
    @('Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01', '2024-05-01'),
    @('Microsoft.Network/privateEndpoints/pep-acme-los-redis-dev-cus-01', '2024-05-01')
  )) {
    if (Get-ConnectivityResource "$($Scope.FoundationId)/providers/$($entry[0])" $entry[1]) { throw 'Retire the Central US runtime before relocating; two active regions are not supported.' }
  }
  $identity = Get-ConnectivityResource $Scope.IdentityId '2024-11-30'
  $isolation = $identity.properties.PSObject.Properties['isolationScope']
  if ($isolation -and $isolation.Value -and $isolation.Value -cne 'None') { throw 'The retained identity forbids cross-region use; do not weaken its isolation.' }
}

function Assert-RegionalRuntimeInventory {
  param($Scope, [string]$Hostname)
  $allowed = @(Get-DevDisposableResourceIds $Scope)
  foreach ($name in $Scope.AppNames) { $allowed += "$($Scope.Id)/providers/Microsoft.App/containerApps/$name" }
  foreach ($kind in @('kv', 'redis')) { $allowed += "$($Scope.Id)/providers/Microsoft.Network/networkInterfaces/nic-acme-los-$kind-dev-$($Scope.Region)-01" }
  $allowed += "$($Scope.EnvironmentId)/managedCertificates/mcert-acme-los-dev-$($Hostname.Replace('.', '-'))"
  $resources = @(Invoke-AzureDnsJson @('resource', 'list', '--subscription', $Scope.Subscription, '--resource-group', $Scope.Group) | ForEach-Object { $_ })
  foreach ($resource in $resources) {
    if ($resource.id -notin $allowed) { throw 'Regional runtime group contains an unexpected resource. Review ownership before deployment or cleanup.' }
  }
}

function Remove-RetirementRegionalDnsLinks {
  param($Scope, $Configuration)
  if (-not $Scope.Relocated) { throw 'Regional DNS link cleanup requires the explicit relocated dev scope.' }
  $group = $Configuration.platformResources.networkResourceGroupName
  $name = "stk-acme-los-dns-links-dev-$($Scope.Region)-01"
  $stack = Invoke-AzureDnsJson @('stack', 'group', 'show', '--subscription', $Scope.PlatformSubscription, '--resource-group', $group, '--name', $name) -AllowMissing
  if (-not $stack) { return }
  $network = "$($Scope.Id)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-$($Scope.Region)-01"
  $expected = @()
  foreach ($pair in @(@('kv', $Configuration.platformResources.privateDnsZones.keyVault), @('redis', $Configuration.platformResources.privateDnsZones.managedRedis))) {
    $expected += "/subscriptions/$($Scope.PlatformSubscription)/resourceGroups/$group/providers/Microsoft.Network/privateDnsZones/$($pair[1])/virtualNetworkLinks/pdzlnk-acme-los-$($pair[0])-dev-$($Scope.Region)-01"
  }
  if ($stack.provisioningState -notin @('succeeded', 'failed', 'canceled') -or $stack.denySettings.mode -ine 'none') { throw 'Regional DNS link stack is not terminal or has deny settings.' }
  $failed = $stack.PSObject.Properties['failedResources']
  $ids = @($stack.resources | ForEach-Object { $_.id }) + @(if ($failed) { $failed.Value | ForEach-Object { $_.id } })
  foreach ($id in $ids) {
    if ($id -notin $expected) { throw 'Regional DNS stack owns an unexpected resource; cleanup refused.' }
    $link = Get-ConnectivityResource $id '2024-06-01'
    if ($link -and $link.properties.virtualNetwork.id -ine $network) { throw 'Regional DNS link targets another network.' }
  }
  Invoke-AzureDnsJson @('stack', 'group', 'delete', '--subscription', $Scope.PlatformSubscription, '--resource-group', $group, '--name', $name, '--action-on-unmanage', 'deleteResources', '--yes') | Out-Null
}

function Get-RetirementImageMetadata {
  param($Scope, $Apps, $PreviousTags, [switch]$AllowNewBuild)
  $metadata = @{}
  foreach ($kind in @('web', 'bff')) {
    $app = @($Apps | Where-Object { $_.name -eq "ca-acme-los-$kind-dev-$($Scope.Region)-01" })
    if ($app.Count -ne 1 -or @($app[0].properties.template.containers).Count -ne 1 -or $app[0].properties.environmentId -ine $Scope.EnvironmentId) { throw 'Both source-owned apps are required before preparing recovery metadata.' }
    $container = $app[0].properties.template.containers[0]
    $repository = if ($kind -eq 'web') { 'acme-los-web' } else { 'acme-los-bff-api' }
    $prefix = "$($Scope.Registry).azurecr.io/$repository"
    $image = [string]$container.image
    $tag = if ($image -match ('^' + [regex]::Escape($prefix) + ':([a-f0-9]{40}-dev)$')) { $Matches[1] } elseif ($image -match ('^' + [regex]::Escape($prefix) + '@sha256:[a-f0-9]{64}$')) { [string]$PreviousTags.'acme:recovery-image-tag' } else { throw 'Recovery requires the approved ACME dev image repository and build tag or digest.' }
    if ($tag -cnotmatch '^[a-f0-9]{40}-dev$') { throw 'Missing recorded recovery image tag.' }
    $manifest = Invoke-AzureDnsJson @('acr', 'manifest', 'show-metadata', '--subscription', $Scope.Subscription, '--registry', $Scope.Registry, '--name', "${repository}:$tag")
    if ($manifest.digest -cnotmatch '^sha256:[a-f0-9]{64}$' -or ($image.Contains('@') -and $image -cne "$prefix@$($manifest.digest)")) { throw 'Recovery image digest does not match the running image.' }
    $previousTag = $PreviousTags.PSObject.Properties['acme:recovery-image-tag']
    if ($previousTag) {
      if ($previousTag.Value -ceq $tag) {
        $previousDigest = $PreviousTags.PSObject.Properties["acme:recovery-$kind-digest"]
        if (-not $previousDigest -or $previousDigest.Value -cne $manifest.digest) { throw 'Recorded recovery image digest changed; refusing to replace approved image evidence.' }
      } elseif (-not $AllowNewBuild) { throw 'A different build is running. Run prepare explicitly for that release before retirement.' }
    }
    $build = @($container.env | Where-Object { $_.name -eq 'APP_BUILD_ID' })
    if ($build.Count -ne 1 -or $build[0].value -cne $tag.Substring(0, 8)) { throw 'App build and image tag disagree.' }
    if ($metadata.ContainsKey('acme:recovery-image-tag') -and $metadata['acme:recovery-image-tag'] -cne $tag) { throw 'Web and BFF must use the same approved build.' }
    $metadata['acme:recovery-image-tag'] = $tag
    $metadata["acme:recovery-$kind-digest"] = $manifest.digest
    if ($kind -eq 'bff') {
      $version = @($container.env | Where-Object { $_.name -eq 'ACME_BFF_VERSION' })
      if ($version.Count -ne 1 -or $version[0].value -notmatch '^\d+\.\d+\.\d+$') { throw 'Missing BFF application version.' }
      $metadata['acme:recovery-bff-version'] = $version[0].value
    }
  }
  return $metadata
}

function Set-RetirementTags {
  param($Scope, [hashtable]$Tags)
  $arguments = @('tag', 'update', '--resource-id', $Scope.FoundationId, '--operation', 'Merge', '--tags')
  foreach ($key in ($Tags.Keys | Sort-Object)) { $arguments += "$key=$($Tags[$key])" }
  Invoke-AzureDnsJson $arguments | Out-Null
}

function Set-RetirementAlerts {
  param($Scope, $Configuration, [bool]$Enabled)
  foreach ($kind in @('failed-requests', 'exceptions', 'auth-failures', 'system-errors')) {
    $id = "/subscriptions/$($Scope.PlatformSubscription)/resourceGroups/$($Configuration.platformResources.monitorResourceGroupName)/providers/Microsoft.Insights/scheduledQueryRules/alrt-acme-los-$kind-dev-cus-01"
    $current = Get-ConnectivityResource $id '2023-12-01'
    if (-not $current) { throw 'All four source-owned dev alert rules must exist.' }
    if ([bool]$current.properties.enabled -ne $Enabled) {
      Invoke-AzureDnsJson @('resource', 'update', '--ids', $id, '--api-version', '2023-12-01', '--set', "properties.enabled=$($Enabled.ToString().ToLowerInvariant())") | Out-Null
    }
    $observed = Get-ConnectivityResource $id '2023-12-01'
    if ([bool]$observed.properties.enabled -ne $Enabled) { throw 'Alert state did not converge.' }
  }
}

function Clear-RetirementCname {
  param($Dns, [switch]$Apply, $Scope)
  $uri = "https://management.azure.com$($Dns.ZoneId)/CNAME/$($Dns.HostLabel)?api-version=2018-05-01"
  $record = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', $uri) -AllowMissing
  if (-not $record) { return }
  if ($record.properties.metadata.'acme-owner' -cne $Dns.Owner -or -not $record.etag) { throw 'Refusing to clear a CNAME without source ownership and ETag.' }
  $value = $record.properties.PSObject.Properties['CNAMERecord']
  if (-not $value -or -not $value.Value) { return }
  $short = if ($Scope) { $Scope.Region } else { 'cus' }
  $location = if ($Scope) { $Scope.Location } else { 'centralus' }
  $pattern = '^' + [regex]::Escape("ca-acme-los-web-dev-$short-01.") + '[a-z0-9-]+\.' + [regex]::Escape("$location.azurecontainerapps.io") + '\.?$'
  if ($value.Value.cname -notmatch $pattern) { throw 'The CNAME points outside the dev application.' }
  if ($Apply) {
    # Empty record sets publish no DNS answer and can be updated without removing the zone lock.
    $properties = @{ TTL = $record.properties.TTL; metadata = $record.properties.metadata }
    Set-AzureWebDnsRecord -Uri $uri -Properties $properties -Etag $record.etag
    $observed = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', $uri)
    $remaining = $observed.properties.PSObject.Properties['CNAMERecord']
    if (($remaining -and $remaining.Value) -or $observed.properties.metadata.'acme-owner' -cne $Dns.Owner) { throw 'CNAME clearing did not converge.' }
  }
}

function Remove-RetirementServiceResources {
  param($Scope, $Stack)
  $failedProperty = $Stack.PSObject.Properties['failedResources']
  $failed = @(if ($failedProperty) { $failedProperty.Value })
  $ownedIds = @(@($Stack.resources) + $failed | ForEach-Object { $_.id })
  $endpoints = @()
  # Stack deletion can run parent and child deletes concurrently. Remove connections before their service.
  foreach ($kind in @('kv', 'redis')) {
    $id = "$($Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-$($Scope.Region)-01"
    $endpoint = Get-ConnectivityResource $id
    if (-not $endpoint) { continue }
    if ($id -notin $ownedIds) { throw 'Private endpoint is not owned by the disposable stack.' }
    $subnet = "$($Scope.Id)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-$($Scope.Region)-01/subnets/snet-acme-los-data-dev-$($Scope.Region)-01"
    $service = if ($kind -eq 'kv') { $Scope.VaultId } else { $Scope.RedisId }
    $connections = @($endpoint.properties.privateLinkServiceConnections)
    if ($endpoint.properties.subnet.id -ine $subnet -or $connections.Count -ne 1 -or
      $connections[0].properties.privateLinkServiceId -ine $service) { throw 'Private endpoint target or subnet differs from the approved dev service.' }
    $endpoints += @{ id = $id; kind = $kind }
  }
  $redis = Get-ConnectivityResource $Scope.RedisId '2025-07-01'
  if ($redis -and $Scope.RedisId -notin $ownedIds) { throw 'Redis is not owned by the disposable stack.' }
  $environment = Get-ConnectivityResource $Scope.EnvironmentId '2025-01-01'
  if ($environment) {
    if ($Scope.EnvironmentId -notin $ownedIds) { throw 'Environment is not recorded by the disposable stack.' }
    $appSubnet = "$($Scope.Id)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-$($Scope.Region)-01/subnets/snet-acme-los-app-dev-$($Scope.Region)-01"
    if ($environment.properties.infrastructureResourceGroup -ine $Scope.InfrastructureGroup -or
      $environment.properties.vnetConfiguration.infrastructureSubnetId -ine $appSubnet) { throw 'Environment networking differs from the approved dev configuration.' }
  }
  foreach ($endpoint in $endpoints) {
    Write-Host "Removing dev $($endpoint.kind) private endpoint before service deletion."
    Invoke-AzureDnsJson @('network', 'private-endpoint', 'delete', '--ids', $endpoint.id) | Out-Null
    if (Get-ConnectivityResource $endpoint.id) { throw 'Private endpoint deletion did not complete.' }
  }
  if ($redis) {
    Write-Host 'Removing disposable dev Redis before stack cleanup.'
    Invoke-AzureDnsJson @('resource', 'delete', '--ids', $Scope.RedisId, '--api-version', '2025-07-01') | Out-Null
    if (Get-ConnectivityResource $Scope.RedisId '2025-07-01') { throw 'A disposable service is still allocated after Redis deletion.' }
  }
  if ($environment) {
    Write-Host 'Removing the disposable dev environment through its owning Azure service.'
    Invoke-AzureDnsJson @('containerapp', 'env', 'delete', '--ids', $Scope.EnvironmentId, '--yes') | Out-Null
    if (Get-ConnectivityResource $Scope.EnvironmentId '2025-01-01') { throw 'Environment deletion did not complete.' }
  }
}
