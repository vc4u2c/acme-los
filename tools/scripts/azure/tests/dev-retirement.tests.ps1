# Exercises the real helpers and orchestration against in-memory CLI/DNS boundaries.
# Fixture IDs, image hashes, and secret-version URIs are synthetic metadata only.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../azure-dns.ps1')
. (Join-Path $PSScriptRoot '../private-connectivity.ps1')
. (Join-Path $PSScriptRoot '../dev-retirement.ps1')
$retirementScript = Join-Path $PSScriptRoot '../set-dev-retirement-state.ps1'

function Assert-True($Condition, [string]$Message) {
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch {
    Assert-True ($_.Exception.Message -match $Pattern) "expected '$Pattern', got '$($_.Exception.Message)'"
    return
  }
  throw "Expected failure matching '$Pattern'."
}

function Copy-TestObject($Value) {
  return ConvertTo-Json -InputObject $Value -Depth 40 | ConvertFrom-Json
}

function Get-TestArgument([string[]]$Arguments, [string]$Name) {
  $index = [array]::IndexOf($Arguments, $Name)
  if ($index -lt 0 -or $index + 1 -ge $Arguments.Count) { throw "Missing CLI argument '$Name'." }
  return $Arguments[$index + 1]
}

function Invoke-AzJson { param([string[]]$Arguments) return Invoke-AzureDnsJson $Arguments }

function New-TestStack([string]$Phase) {
  $s = $global:retirementTest
  $name = if ($Phase -eq 'disposable') { $s.Scope.DisposableStack } else { $s.Scope.RetainedStack }
  $ids = if ($Phase -eq 'all') { @($s.RetainedIds) + @($s.DisposableIds) } elseif ($Phase -eq 'retained') { $s.RetainedIds } else { $s.DisposableIds }
  $parameters = @{}
  foreach ($entry in @{
    environmentName = 'dev'; organizationShortName = 'acme'; workloadShortName = 'los'
    regionShortName = 'cus'; instanceNumber = '01'; uniqueShortSuffix = 'v42c'
    stateStoreMode = 'redis'; platformSubscriptionId = $s.Scope.PlatformSubscription
    resourcePhase = $Phase
  }.GetEnumerator()) {
    # ARM omits reference for ordinary value-bearing stack parameters.
    $parameters[$entry.Key] = @{ type = 'string'; value = $entry.Value }
  }
  return @{
    id = "$($s.Scope.Id)/providers/Microsoft.Resources/deploymentStacks/$name"; name = $name
    provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }; parameters = $parameters
    resources = @($ids | ForEach-Object { @{ id = $_ } })
  }
}

function Reset-TestState {
  $configuration = Copy-TestObject @{
    projectName = 'acme-los'; primaryRegionShortName = 'cus'
    subscriptions = @{ nonprodOnline = 'sub-acme-nonprod-online'; platform = 'sub-acme-platform' }
    platformResources = @{ monitorResourceGroupName = 'rg-acme-monitor-cus-01'; publicDnsResourceGroupName = 'rg-acme-los-dns-cus-01' }
    environments = @{ dev = @{ subscriptionRole = 'nonprod'; publicDomain = @{
      enabled = $true; hostname = 'apply-dev.los.example.test'; managedCertificateValidationMethod = 'CNAME'
      dns = @{ provider = 'azure'; zone = 'los.example.test' }
    } } }
  }
  $scope = Get-DevRetirementScope $configuration '11111111-1111-1111-1111-111111111111' '22222222-2222-2222-2222-222222222222'
  $dns = Get-AzureWebDnsConfiguration $configuration 'dev' $scope.PlatformSubscription
  $global:retirementTest = @{
    Configuration = $configuration; Scope = $scope; Dns = $dns; Resources = @{}; Apps = @{}; Stacks = @{}
    Calls = [Collections.Generic.List[object]]::new(); Events = [Collections.Generic.List[string]]::new()
    TemporaryFiles = [Collections.Generic.List[string]]::new(); Unexpected = [Collections.Generic.List[string]]::new()
    Pages = @{}; Failure = ''; Sleeps = 0; SecretReads = 0; DeployReads = 0; EnvironmentAbsenceConfirmed = $false
    Tag = ('a' * 40) + '-dev'; WebDigest = 'sha256:' + ('b' * 64); BffDigest = 'sha256:' + ('c' * 64)
    Tags = @{ 'acme:application' = 'acme-los'; 'acme:environment' = 'dev'; 'acme:hibernated' = 'false' }
    NameServers = @('ns1.example.test', 'ns2.example.test', 'ns3.example.test', 'ns4.example.test')
  }
  $s = $global:retirementTest
  $network = "$($scope.Id)/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01"
  $s.RetainedIds = @(
    $scope.VaultId, $scope.IdentityId, $scope.AcsId, $network,
    "$network/subnets/snet-acme-los-app-dev-cus-01", "$network/subnets/snet-acme-los-data-dev-cus-01",
    "$($scope.Id)/providers/Microsoft.Network/networkSecurityGroups/nsg-acme-los-app-dev-cus-01",
    "$($scope.Id)/providers/Microsoft.Network/networkSecurityGroups/nsg-acme-los-data-dev-cus-01",
    "$($scope.VaultId)/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-kv-dev-cus-01"
  )
  foreach ($parent in @($scope.VaultId, $scope.AcsId, $scope.RegistryId)) {
    $s.RetainedIds += "$parent/providers/Microsoft.Authorization/roleAssignments/33333333-3333-3333-3333-333333333333"
  }
  $s.DisposableIds = @(
    $scope.EnvironmentId, "$($scope.EnvironmentId)/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-cae-dev-cus-01",
    $scope.RedisId, "$($scope.RedisId)/databases/default",
    "$($scope.RedisId)/databases/default/accessPolicyAssignments/aparedis012345",
    "$($scope.RedisId)/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-redis-dev-cus-01"
  )
  $s.NicIds = @()
  foreach ($kind in @('kv', 'redis')) {
    $endpoint = "$($scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01"
    $s.DisposableIds += @($endpoint, "$endpoint/privateDnsZoneGroups/default")
    $s.NicIds += "$($scope.Id)/providers/Microsoft.Network/networkInterfaces/nic-acme-los-$kind-dev-cus-01"
  }
  foreach ($id in @($s.RetainedIds) + @($s.DisposableIds) + @($s.NicIds)) { $s.Resources[$id] = @{ id = $id; properties = @{} } }
  $s.Resources[$scope.EnvironmentId].properties = @{
    infrastructureResourceGroup = $scope.InfrastructureGroup
    vnetConfiguration = @{ infrastructureSubnetId = "$network/subnets/snet-acme-los-app-dev-cus-01" }
  }
  foreach ($kind in @('kv', 'redis')) {
    $endpoint = "$($scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01"
    $service = if ($kind -eq 'kv') { $scope.VaultId } else { $scope.RedisId }
    $groupId = if ($kind -eq 'kv') { 'vault' } else { 'redisEnterprise' }
    $s.Resources[$endpoint].properties = @{
      subnet = @{ id = "$network/subnets/snet-acme-los-data-dev-cus-01" }
      privateLinkServiceConnections = @(@{
        name = "plsc-acme-los-$kind-dev-cus-01"
        properties = @{ privateLinkServiceId = $service; groupIds = @($groupId); privateLinkServiceConnectionState = @{ status = 'Approved' } }
      })
      networkInterfaces = @(@{ id = "$($scope.Id)/providers/Microsoft.Network/networkInterfaces/nic-acme-los-$kind-dev-cus-01" })
    }
  }
  $s.Resources[$scope.VaultId].properties = @{ publicNetworkAccess = 'Disabled'; tenantId = '44444444-4444-4444-4444-444444444444' }
  $s.Resources[$scope.IdentityId].properties = @{ principalId = '55555555-5555-5555-5555-555555555555'; clientId = '66666666-6666-6666-6666-666666666666' }
  $s.Resources[$scope.AcsId].properties = @{ disableLocalAuth = $true }
  $s.SecretUri = "https://management.azure.com$($scope.VaultId)/secrets?api-version=2023-07-01"
  $s.NextUri = $s.SecretUri + '&$skiptoken=offline-page-2'
  $secrets = @(1..4 | ForEach-Object { @{ properties = @{ secretUriWithVersion = "https://fixture.vault.azure.net/secrets/fixture-$_/version-1" } } })
  $s.Pages[$s.SecretUri] = @{ value = @($secrets[0], $secrets[1]); nextLink = $s.NextUri }
  $s.Pages[$s.NextUri] = @{ value = @($secrets[2], $secrets[3]) }
  $s.Resources[$dns.ZoneId] = @{
    id = $dns.ZoneId; tags = @{ acmeApplication = 'acme-los'; acmeLifecycle = 'retain' }
    properties = @{ zoneType = 'Public'; nameServers = $s.NameServers }
  }
  $s.CnameId = "$($dns.ZoneId)/CNAME/$($dns.HostLabel)"
  $s.TxtId = "$($dns.ZoneId)/TXT/asuid.$($dns.HostLabel)"
  $s.Resources[$s.CnameId] = @{ etag = '"record-version-1"'; properties = @{
    TTL = 600; metadata = @{ 'acme-owner' = $dns.Owner; purpose = 'retained' }; CNAMERecord = @{ cname = 'ca-acme-los-web-dev-cus-01.fixture.centralus.azurecontainerapps.io' }
  } }
  $s.Resources[$s.TxtId] = @{ properties = @{ TXTRecords = @(@{ value = @('D' * 64) }) } }
  $s.AlertIds = @()
  foreach ($kind in @('failed-requests', 'exceptions', 'auth-failures', 'system-errors')) {
    $id = "/subscriptions/$($scope.PlatformSubscription)/resourceGroups/$($configuration.platformResources.monitorResourceGroupName)/providers/Microsoft.Insights/scheduledQueryRules/alrt-acme-los-$kind-dev-cus-01"
    $s.AlertIds += $id
    $s.Resources[$id] = @{ id = $id; properties = @{ enabled = $true } }
  }
  foreach ($kind in @('web', 'bff')) {
    $repository = if ($kind -eq 'web') { 'acme-los-web' } else { 'acme-los-bff-api' }
    $name = "ca-acme-los-$kind-dev-cus-01"
    $s.Apps[$name] = @{ name = $name; properties = @{ environmentId = $scope.EnvironmentId; template = @{ containers = @(@{
      image = "$($scope.Registry).azurecr.io/${repository}:$($s.Tag)"
      env = @(@{ name = 'APP_BUILD_ID'; value = 'aaaaaaaa' }, @{ name = 'ACME_BFF_VERSION'; value = '1.2.3' })
    }) } } }
  }
  $s.Stacks[$scope.RetainedStack] = New-TestStack 'all'
}

function Set-TestPrepared {
  $s = $global:retirementTest
  $s.Stacks[$s.Scope.RetainedStack] = New-TestStack 'retained'
  $s.Stacks[$s.Scope.DisposableStack] = New-TestStack 'disposable'
  $s.Tags['acme:recovery-retained-hash'] = Get-RetirementProtectedFingerprint $s.Scope
  $s.Tags['acme:retirement'] = 'active'
  $s.Tags['acme:recovery-image-tag'] = $s.Tag
  $s.Tags['acme:recovery-web-digest'] = $s.WebDigest
  $s.Tags['acme:recovery-bff-digest'] = $s.BffDigest
  $s.Tags['acme:recovery-bff-version'] = '1.2.3'
  $s.Calls.Clear()
  $s.SecretReads = 0
}

function Invoke-TestRetirement([string]$Action, [hashtable]$Extra = @{}) {
  $s = $global:retirementTest
  $parameters = @{
    Action = $Action; SubscriptionId = $s.Scope.Subscription; PlatformSubscriptionId = $s.Scope.PlatformSubscription
    ConfigurationPath = $testConfigurationPath
  }
  if ($Action -ne 'show-plan') { $parameters.ConfirmResourceGroup = $s.Scope.Group }
  if ($Action -eq 'retire') { $parameters.DiscardDemoData = $true }
  foreach ($entry in $Extra.GetEnumerator()) { $parameters[$entry.Key] = $entry.Value }
  & $retirementScript @parameters
}

function Assert-NoTestDeletes {
  Assert-True (@($global:retirementTest.Events | Where-Object { $_ -like 'delete:*' }).Count -eq 0) 'no deletion was attempted'
}

function Assert-TestRetained {
  $s = $global:retirementTest
  foreach ($id in @($s.RetainedIds) + @($s.Dns.ZoneId, $s.TxtId)) { Assert-True ($s.Resources.ContainsKey($id)) "retains $id" }
  Assert-True ($s.Stacks.ContainsKey($s.Scope.RetainedStack)) 'retained stack still exists'
}

function Get-TestDeploymentBlock([string]$Variable, [switch]$Assignment) {
  # Execute selected production statements, not copied implementations or text assertions.
  $candidates = if ($Assignment) {
    $deploymentAst.FindAll({ param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] }, $true)
  } else { $deploymentAst.EndBlock.Statements }
  $nodes = @($candidates | Where-Object {
    if ($Assignment) {
      $_ -is [Management.Automation.Language.AssignmentStatementAst] -and
        $_.Left -is [Management.Automation.Language.VariableExpressionAst] -and $_.Left.VariablePath.UserPath -eq $Variable
    } elseif ($_ -is [Management.Automation.Language.IfStatementAst]) {
      @($_.FindAll({ param($node)
        $node -is [Management.Automation.Language.VariableExpressionAst] -and $node.VariablePath.UserPath -eq $Variable
      }, $true)).Count -gt 0
    }
  })
  Assert-True ($nodes.Count -eq 1) "exactly one deployment statement for $Variable"
  return [scriptblock]::Create($nodes[0].Extent.Text)
}

$savedFunctions = @{}
foreach ($name in @('az', 'node', 'Start-Sleep', 'Invoke-WebRequest', 'Invoke-RestMethod')) {
  $item = Get-Item "Function:$name" -ErrorAction SilentlyContinue
  $savedFunctions[$name] = if ($item) { $item.ScriptBlock } else { $null }
}
$previousState = Get-Variable retirementTest -Scope Global -ErrorAction SilentlyContinue
$testConfigurationPath = [IO.Path]::GetTempFileName()

try {
  function global:az {
    $a = [string[]]@($args | ForEach-Object { $_ })
    $global:LASTEXITCODE = 0
    $s = $global:retirementTest
    $s.Calls.Add(@{ Arguments = $a })
    $verb = $a[0..2] -join ' '
    $result = $null
    switch -Wildcard ($verb) {
      'account show *' {
        $id = Get-TestArgument $a '--subscription'
        $name = if ($id -eq $s.Scope.Subscription) { $s.Configuration.subscriptions.nonprodOnline } else { $s.Configuration.subscriptions.platform }
        if ($s.Failure -eq 'account') { $name = 'unexpected-subscription' }
        $result = @{ id = $id; name = $name }
      }
      'group show *' {
        $name = Get-TestArgument $a '--name'
        Assert-True ((Get-TestArgument $a '--subscription') -eq $s.Scope.Subscription) 'only workload groups queried'
        if ($name -eq $s.Scope.Group) { $result = @{ tags = $s.Tags } }
        elseif ($name -eq $s.Scope.InfrastructureGroup) {
          if ($s.Failure -eq 'managed-network') { $result = @{ name = $name } }
          else { $global:LASTEXITCODE = 1; return 'ERROR: (ResourceGroupNotFound) Synthetic group absent' }
        } else { throw "Unexpected group $name" }
      }
      'deployment group list' {
        $s.DeployReads++
        $result = @()
        if ($s.Failure -eq 'deploying' -or ($s.Failure -eq 'deployment-race' -and $s.DeployReads -gt 1)) {
          $result = @(@{ properties = @{ provisioningState = 'Running' } })
        }
      }
      'stack group list' {
        if ($s.Failure -eq 'stack-ownership-race' -and $s.Apps.Count -eq 0) {
          $s.Stacks[$s.Scope.DisposableStack].resources += @{ id = $s.Dns.ZoneId }
        }
        if ($s.Failure -eq 'stack-failed-ownership-race' -and $s.Apps.Count -eq 0) {
          $s.Stacks[$s.Scope.DisposableStack].failedResources += @{ id = $s.Dns.ZoneId; error = @{ code = 'DeploymentFailed' } }
        }
        $result = @($s.Stacks.Values)
      }
      'acr manifest show-metadata' {
        Assert-True ((Get-TestArgument $a '--registry') -eq $s.Scope.Registry) 'source registry only'
        Assert-True ((Get-TestArgument $a '--subscription') -eq $s.Scope.Subscription) 'source subscription only'
        $name = Get-TestArgument $a '--name'
        Assert-True ($name -match '^acme-los-(web|bff-api):[a-f0-9]{40}-dev$') 'manifest request uses approved repository and tag'
        $digest = if ($name.StartsWith('acme-los-web:')) { $s.WebDigest } else { $s.BffDigest }
        $result = @{ digest = $digest }
      }
      'deployment group validate' {
        $path = (Get-TestArgument $a '--parameters').Substring(1)
        $s.TemporaryFiles.Add($path)
        $parameters = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        $phase = $parameters.parameters.resourcePhase.value
        $s.Events.Add("validate:$phase")
        if ($s.Failure -eq "validate-$phase") { $global:LASTEXITCODE = 1; return 'ERROR: (InvalidTemplate) Synthetic validation failure' }
      }
      'stack group create' {
        Assert-True ((Get-TestArgument $a '--action-on-unmanage') -ceq 'detachAll') 'prepare must detach, never delete'
        Assert-True ((Get-TestArgument $a '--deny-settings-mode') -ceq 'none') 'no deny setting bypass'
        Assert-True ((Get-TestArgument $a '--resource-group') -eq $s.Scope.Group) 'workload group only'
        $path = (Get-TestArgument $a '--parameters').Substring(1)
        $s.TemporaryFiles.Add($path)
        $parameters = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        $phase = $parameters.parameters.resourcePhase.value
        $name = Get-TestArgument $a '--name'
        $expectedName = if ($phase -eq 'retained') { $s.Scope.RetainedStack } else { $s.Scope.DisposableStack }
        Assert-True ($name -eq $expectedName) 'phase owns the intended stack'
        Assert-True ($parameters.parameters.environmentName.value -ceq 'dev') 'source parameters preserved'
        $s.Events.Add("create:$phase")
        if ($s.Failure -eq "create-$phase") {
          $failedStack = New-TestStack $phase
          $failedStack.provisioningState = 'Failed'
          # Failed migration can persist new parameters with old, mixed ownership.
          $failedStack.resources = if ($phase -eq 'retained') {
            @($s.Stacks[$name].resources | Where-Object { $_.id -ne $s.Scope.AcsId })
          } else { @($failedStack.resources[0]) }
          $s.Stacks[$name] = $failedStack
          $global:LASTEXITCODE = 1
          return 'ERROR: (DeploymentFailed) Synthetic create failure'
        }
        $s.Stacks[$name] = New-TestStack $phase
        if ($s.Failure -eq 'retained-ownership' -and $phase -eq 'retained') {
          $s.Stacks[$name].resources = @($s.Stacks[$name].resources | Where-Object { $_.id -ne $s.RetainedIds[4] })
        }
      }
      'tag update *' {
        Assert-True ((Get-TestArgument $a '--resource-id') -eq $s.Scope.Id) 'only workload group tagged'
        Assert-True ((Get-TestArgument $a '--operation') -ceq 'Merge') 'unrelated tags preserved'
        $index = [array]::IndexOf($a, '--tags') + 1
        while ($index -lt $a.Count -and -not $a[$index].StartsWith('--')) {
          $pair = $a[$index] -split '=', 2
          $s.Tags[$pair[0]] = $pair[1]
          if ($pair[0] -eq 'acme:retirement') { $s.Events.Add("marker:$($pair[1])") }
          $index++
        }
      }
      'resource update *' {
        $id = Get-TestArgument $a '--ids'
        Assert-True ($id -in $s.AlertIds) 'only four owned alerts updated'
        $enabled = (Get-TestArgument $a '--set') -ceq 'properties.enabled=true'
        $s.Events.Add("alert:$enabled")
        if ($s.Failure -ne 'alert-stuck') { $s.Resources[$id].properties.enabled = $enabled }
      }
      'containerapp delete *' {
        $name = Get-TestArgument $a '--name'
        Assert-True ($name -in $s.Scope.AppNames) 'only two source apps deleted'
        Assert-True ((Get-TestArgument $a '--subscription') -eq $s.Scope.Subscription) 'workload subscription only'
        Assert-True ((Get-TestArgument $a '--resource-group') -eq $s.Scope.Group) 'workload group only'
        $record = Copy-TestObject $s.Resources[$s.CnameId]
        $target = if ($record) { $record.properties.PSObject.Properties['CNAMERecord'] } else { $null }
        Assert-True (-not $target -or -not $target.Value) 'alias target cleared before app deletion'
        foreach ($id in $s.AlertIds) { Assert-True (-not $s.Resources[$id].properties.enabled) 'alerts suppressed before deletion' }
        $s.Events.Add("delete:app:$name")
        if ($s.Failure -eq 'app-delete') { $global:LASTEXITCODE = 1; return 'ERROR: (Conflict) Synthetic delete failure' }
        if ($s.Failure -ne 'app-stuck') { $s.Apps.Remove($name) }
      }
      'network private-endpoint delete' {
        $id = Get-TestArgument $a '--ids'
        $kind = @('kv', 'redis') | Where-Object { $id -eq "$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$_-dev-cus-01" }
        Assert-True (@($kind).Count -eq 1) 'only source-owned dev endpoints explicitly deleted'
        Assert-True ($s.Resources.ContainsKey($id)) 'absent endpoints are skipped'
        Assert-True ($s.Apps.Count -eq 0) 'apps absent before private endpoint deletion'
        if ($kind -eq 'redis') {
          Assert-True (-not $s.Resources.ContainsKey("$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01")) 'Key Vault endpoint absent before Redis endpoint deletion'
        }
        $s.Events.Add("delete:endpoint:$kind")
        if ($s.Failure -eq "$kind-endpoint-delete") { $global:LASTEXITCODE = 1; return 'ERROR: (Conflict) Synthetic endpoint delete failure' }
        if ($s.Failure -ne "$kind-endpoint-stuck") {
          $s.Resources.Remove($id)
          $s.Resources.Remove("$id/privateDnsZoneGroups/default")
          $s.Resources.Remove("$($s.Scope.Id)/providers/Microsoft.Network/networkInterfaces/nic-acme-los-$kind-dev-cus-01")
        }
      }
      'resource delete *' {
        $id = Get-TestArgument $a '--ids'
        Assert-True ($id -eq $s.Scope.RedisId) 'only the source Redis parent is explicitly deleted, never its children or the environment'
        Assert-True ((Get-TestArgument $a '--api-version') -ceq '2025-07-01') 'Redis deletion uses the required API version'
        Assert-True ($s.Resources.ContainsKey($id)) 'absent Redis is skipped'
        Assert-True ($s.Apps.Count -eq 0) 'apps absent before Redis deletion'
        foreach ($kind in @('kv', 'redis')) {
          Assert-True (-not $s.Resources.ContainsKey("$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01")) 'both private endpoints absent before Redis deletion'
        }
        $s.Events.Add('delete:redis')
        if ($s.Failure -eq 'redis-delete') { $global:LASTEXITCODE = 1; return 'ERROR: (Conflict) Synthetic Redis delete failure' }
        if ($s.Failure -ne 'redis-stuck') {
          foreach ($resourceId in @($s.Resources.Keys | Where-Object { $_ -eq $id -or $_.StartsWith("$id/", [StringComparison]::OrdinalIgnoreCase) })) {
            $s.Resources.Remove($resourceId)
          }
        }
      }
      'containerapp env delete' {
        $id = Get-TestArgument $a '--ids'
        Assert-True ($id -eq $s.Scope.EnvironmentId) 'only the source-owned dev environment is explicitly deleted'
        Assert-True ($a -contains '--yes' -and $a -notcontains '--no-wait') 'environment deletion is confirmed and synchronous'
        Assert-True ($s.Resources.ContainsKey($id)) 'absent environment is skipped'
        Assert-True ($s.Apps.Count -eq 0) 'apps absent before environment deletion'
        Assert-True (-not $s.Resources.ContainsKey($s.Scope.RedisId)) 'Redis absent before environment deletion'
        foreach ($kind in @('kv', 'redis')) {
          Assert-True (-not $s.Resources.ContainsKey("$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01")) 'both private endpoints absent before environment deletion'
        }
        $s.Events.Add('delete:environment')
        $s.EnvironmentAbsenceConfirmed = $false
        if ($s.Failure -eq 'environment-delete') { $global:LASTEXITCODE = 1; return 'ERROR: (Conflict) Synthetic environment delete failure' }
        if ($s.Failure -ne 'environment-stuck') {
          foreach ($resourceId in @($s.Resources.Keys | Where-Object { $_ -eq $id -or $_.StartsWith("$id/", [StringComparison]::OrdinalIgnoreCase) })) {
            $s.Resources.Remove($resourceId)
          }
        }
      }
      'stack group delete' {
        Assert-True ((Get-TestArgument $a '--name') -eq $s.Scope.DisposableStack) 'never delete retained stack'
        Assert-True ((Get-TestArgument $a '--action-on-unmanage') -ceq 'deleteResources') 'delete only disposable resources, not groups'
        Assert-True ((Get-TestArgument $a '--resource-group') -eq $s.Scope.Group) 'only workload stack'
        Assert-True ($s.Apps.Count -eq 0) 'apps absent before disposable stack deletion'
        Assert-True (-not $s.Resources.ContainsKey($s.Scope.RedisId)) 'Redis absent before disposable stack deletion'
        Assert-True (-not $s.Resources.ContainsKey($s.Scope.EnvironmentId)) 'environment absent before disposable stack deletion'
        if ($s.Events.Contains('delete:environment')) { Assert-True $s.EnvironmentAbsenceConfirmed 'environment absence read back before disposable stack deletion' }
        foreach ($kind in @('kv', 'redis')) {
          Assert-True (-not $s.Resources.ContainsKey("$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01")) 'private endpoints absent before disposable stack deletion'
        }
        $s.Events.Add('delete:disposable')
        if ($s.Failure -eq 'stack-delete') { $global:LASTEXITCODE = 1; return 'ERROR: (Conflict) Synthetic stack failure' }
        $ownedIds = @($s.Stacks[$s.Scope.DisposableStack].resources | ForEach-Object { $_.id })
        $s.Stacks.Remove($s.Scope.DisposableStack)
        foreach ($id in $ownedIds) {
          $s.Resources.Remove($id)
        }
      }
      'resource list *' {
        Assert-True ((Get-TestArgument $a '--resource-group') -eq $s.Scope.InfrastructureGroup) 'inspect, never delete, managed network'
        $result = @(@{ id = 'synthetic-managed-resource' })
      }
      'rest --method *' {
        $rawUri = Get-TestArgument $a '--uri'
        $uri = $rawUri.Trim('"')
        $id = ($uri -replace '^https://management\.azure\.com', '').Split('?')[0]
        $method = Get-TestArgument $a '--method'
        if ($method -eq 'delete') {
          throw 'ScopeLocked: the retained DNS zone deletion lock protects all record sets'
        } elseif ($method -eq 'put') {
          Assert-True ($id -eq $s.CnameId) 'only app CNAME target may be cleared by REST'
          $path = (Get-TestArgument $a '--headers').Substring(1)
          $s.TemporaryFiles.Add($path)
          $headers = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
          Assert-True ($headers.'If-Match' -ceq $s.Resources[$id].etag) 'exact quoted ETag passed in conditional update'
          Assert-True (@($headers.PSObject.Properties).Count -eq 2 -and $headers.'Content-Type' -eq 'application/json') 'only content type and exact match condition'
          $bodyPath = (Get-TestArgument $a '--body').Substring(1)
          $s.TemporaryFiles.Add($bodyPath)
          $body = Get-Content -LiteralPath $bodyPath -Raw | ConvertFrom-Json
          Assert-True (-not $body.properties.PSObject.Properties['CNAMERecord']) 'empty record set has no alias target'
          Assert-True ($body.properties.TTL -eq 600 -and $body.properties.metadata.purpose -eq 'retained') 'TTL and unrelated metadata retained'
          Assert-True ($body.properties.metadata.'acme-owner' -eq $s.Dns.Owner) 'ownership retained'
          $s.Events.Add('clear:cname')
          if ($s.Failure -eq 'cname-race') { $global:LASTEXITCODE = 1; return 'ERROR: (PreconditionFailed) Synthetic concurrent writer' }
          if ($s.Failure -ne 'cname-stuck') { $s.Resources[$id].properties = $body.properties }
        } elseif ($method -eq 'get') {
          if ($id -eq $s.Scope.RedisId) { Assert-True ($uri.EndsWith('?api-version=2025-07-01')) 'Redis existence and absence checks use the required API version' }
          if ($id -eq $s.Scope.EnvironmentId) {
            Assert-True ($uri.EndsWith('?api-version=2025-01-01')) 'environment existence and absence checks use the required API version'
            if (-not $s.Resources.ContainsKey($id)) { $s.EnvironmentAbsenceConfirmed = $true }
          }
          if ($id -eq "$($s.Scope.VaultId)/secrets") {
            $s.SecretReads++
            if ($s.Failure -eq 'secret403') { $global:LASTEXITCODE = 1; return 'ERROR: (AuthorizationFailed) Synthetic access denial' }
            Assert-True ($s.Pages.ContainsKey($uri)) 'only expected metadata pagination links requested'
            if ($PSVersionTable.PSEdition -eq 'Desktop' -and $uri.Contains('&')) {
              Assert-True ($rawUri -ceq ('"' + $uri + '"')) 'continuation ampersand is protected from az.cmd parsing'
            }
            $result = $s.Pages[$uri]
          } elseif ($id -eq "$($s.Scope.Id)/providers/Microsoft.App/containerApps") { $result = @{ value = @($s.Apps.Values) } }
          elseif ($id.StartsWith("$($s.Scope.Id)/providers/Microsoft.App/containerApps/")) {
            if ($s.Failure -eq 'app403') { $global:LASTEXITCODE = 1; return 'ERROR: (AuthorizationFailed) Synthetic app access denial' }
            $name = $id.Split('/')[-1]
            if ($s.Apps.ContainsKey($name)) { $result = $s.Apps[$name] }
            else { $global:LASTEXITCODE = 1; return 'ERROR: Not Found({"error":{"code":"ResourceNotFound","message":"Synthetic app absent"}})' }
          } elseif ($s.Resources.ContainsKey($id)) { $result = $s.Resources[$id] }
          else { $global:LASTEXITCODE = 1; return 'ERROR: Not Found({"error":{"code":"ResourceNotFound","message":"Synthetic resource absent"}})' }
        } else { throw "Unexpected REST method $method" }
      }
      default { $s.Unexpected.Add($verb); throw "Unexpected Azure CLI command in offline test: $verb" }
    }
    if ($null -ne $result) { ConvertTo-Json -InputObject $result -Depth 40 -Compress }
  }

  function global:node {
    $s = $global:retirementTest
    $global:LASTEXITCODE = 0
    Assert-True ($args.Count -eq 3 -and [IO.Path]::GetFileName($args[0]) -eq 'verify-public-dns.mjs') 'only mocked DNS verifier may run'
    Assert-True ($args[1] -eq 'zone' -and $args[2] -eq $s.Dns.Zone) 'only fixture delegation queried'
    $servers = if ($s.Failure -eq 'delegation') { @('wrong.example.test') } else { $s.NameServers }
    @{ zone = $s.Dns.Zone; nameServers = $servers } | ConvertTo-Json -Compress
  }
  function global:Start-Sleep { param($Seconds) $global:retirementTest.Sleeps++ }
  function global:Invoke-WebRequest { throw 'HTTP is forbidden in offline retirement tests.' }
  function global:Invoke-RestMethod { throw 'HTTP is forbidden in offline retirement tests.' }

  Reset-TestState
  $global:retirementTest.Configuration | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $testConfigurationPath -Encoding UTF8
  $tokens = $null
  $parseErrors = $null
  $deploymentAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../deploy-web-environment.ps1'), [ref]$tokens, [ref]$parseErrors)
  Assert-True ($parseErrors.Count -eq 0) 'deployment script parses before recovery branch tests'
  $tests = [ordered]@{}
  $testArguments = @{}

  $tests['classification accepts only the explicit retained and disposable resource inventory'] = {
    foreach ($id in $s.RetainedIds) { Assert-True ((Get-RetirementResourceClass $s.Scope $id) -eq 'retained') "retained class: $id" }
    foreach ($id in $s.DisposableIds) { Assert-True ((Get-RetirementResourceClass $s.Scope $id.ToUpperInvariant()) -eq 'disposable') "case-insensitive ARM ID: $id" }
  }
  $tests['disposable inventory helper returns exactly the independently specified nine resource IDs'] = {
    $expected = @($s.DisposableIds | Where-Object { $_ -notlike '*/accessPolicyAssignments/*' } | Sort-Object)
    $actual = @(Get-DevDisposableResourceIds $s.Scope | Sort-Object)
    Assert-True ($expected.Count -eq 9 -and $actual.Count -eq 9 -and @($actual | Select-Object -Unique).Count -eq 9) 'nine distinct parents, diagnostics, endpoints, and zone groups'
    Assert-True (@(Compare-Object $expected $actual).Count -eq 0) 'exact source-owned inventory, with policy checked separately'
  }
  $tests['classification fails closed for cross-scope, unknown, prefix-confused, and unowned child IDs'] = {
    $unknown = @(
      $s.Scope.Id, $s.Dns.ZoneId, $s.Scope.RegistryId, $s.NicIds[0],
      "$($s.Scope.Id)/providers/Microsoft.App/containerApps/$($s.Scope.AppNames[0])",
      $s.Scope.VaultId.Replace('/resourceGroups/', '/resourceGroups/other-'),
      $s.Scope.RedisId.Replace($s.Scope.Subscription, $s.Scope.PlatformSubscription),
      "$($s.Scope.RedisId)-other", "$($s.Scope.RedisId)/databases/other",
      "$($s.Scope.RedisId)/databases/default/accessPolicyAssignments/unknown",
      "$($s.Scope.RedisId)/databases/default/accessPolicyAssignments/aparedis123/child",
      "$($s.Scope.IdentityId)/providers/Microsoft.Authorization/roleAssignments/33333333-3333-3333-3333-333333333333",
      "$($s.Scope.VaultId)/secrets/fixture", "$($s.Scope.VaultId)/providers/Microsoft.Authorization/roleAssignments/not-a-guid"
    )
    foreach ($id in $unknown) { Assert-Fails { Get-RetirementResourceClass $s.Scope $id } 'Unexpected stack resource' }
    Assert-True ($s.Calls.Count -eq 0) 'classification needs no Azure requests'
  }
  $tests['scope rejects production, unexpected project or region, equal subscriptions, and non-GUIDs'] = {
    foreach ($field in @('projectName', 'primaryRegionShortName')) {
      $config = Copy-TestObject $s.Configuration
      $config.$field = 'unexpected'
      Assert-Fails { Get-DevRetirementScope $config $s.Scope.Subscription $s.Scope.PlatformSubscription } 'restricted'
    }
    $config = Copy-TestObject $s.Configuration
    $config.environments.dev.subscriptionRole = 'prod'
    Assert-Fails { Get-DevRetirementScope $config $s.Scope.Subscription $s.Scope.PlatformSubscription } 'restricted'
    Assert-Fails { Get-DevRetirementScope $s.Configuration $s.Scope.Subscription $s.Scope.Subscription } 'restricted'
    Assert-Fails { Get-DevRetirementScope $s.Configuration 'not-a-guid' $s.Scope.PlatformSubscription } 'GUIDs'
  }
  $tests['stack validation rejects mixed ownership, unknown resources, empty stacks, and wrong parameters'] = {
    foreach ($phase in @('all', 'retained', 'disposable')) { Assert-RetirementStack $s.Scope (Copy-TestObject (New-TestStack $phase)) $phase }
    $stack = Copy-TestObject (New-TestStack 'disposable')
    $stack.resources += [pscustomobject]@{ id = $s.Scope.VaultId }
    Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' } 'owns a retained'
    $stack = Copy-TestObject (New-TestStack 'retained')
    $stack.resources += [pscustomobject]@{ id = $s.Scope.RedisId }
    Assert-Fails { Assert-RetirementStack $s.Scope $stack 'retained' } 'owns a disposable'
    $stack.resources = @([pscustomobject]@{ id = $s.Dns.ZoneId })
    Assert-Fails { Assert-RetirementStack $s.Scope $stack 'retained' } 'Unexpected stack resource'
    $stack.resources = @()
    Assert-Fails { Assert-RetirementStack $s.Scope $stack 'retained' } 'empty or incomplete'
    foreach ($name in @('environmentName', 'platformSubscriptionId', 'stateStoreMode')) {
      $stack = Copy-TestObject (New-TestStack 'retained')
      $stack.parameters.$name.value = 'unexpected'
      Assert-Fails { Assert-RetirementStack $s.Scope $stack 'retained' } "parameter $name"
    }
  }
  $tests['terminal stack failures require explicit AllowFailed and never bypass ownership or deny settings'] = {
    foreach ($state in @('Failed', 'Canceled')) {
      $stack = Copy-TestObject (New-TestStack 'disposable')
      $stack.provisioningState = $state
      Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' } 'Stack must be succeeded'
      Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed
      $stack.denySettings.mode = 'denyDelete'
      Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed } 'deny settings'
      $stack.denySettings.mode = 'none'
      $stack.resources += [pscustomobject]@{ id = $s.Scope.VaultId }
      Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed } 'owns a retained'
    }
  }
  $tests['initial stack validation requires every disposable ID and exactly one Redis identity policy'] = {
    foreach ($phase in @('all', 'disposable')) {
      foreach ($id in @($s.DisposableIds | Where-Object { $_ -notlike '*/accessPolicyAssignments/*' })) {
        $stack = Copy-TestObject (New-TestStack $phase)
        $stack.resources = @($stack.resources | Where-Object { $_.id -ne $id })
        Assert-Fails { Assert-RetirementStack $s.Scope $stack $phase } 'Incomplete disposable ownership'
        Assert-RetirementStack $s.Scope $stack $phase -AllowPartial
      }
      foreach ($count in @(0, 2)) {
        $stack = Copy-TestObject (New-TestStack $phase)
        if ($count -eq 0) { $stack.resources = @($stack.resources | Where-Object { $_.id -notlike '*/accessPolicyAssignments/*' }) }
        else { $stack.resources += [pscustomobject]@{ id = "$($s.Scope.RedisId)/databases/default/accessPolicyAssignments/aparedis67890" } }
        Assert-Fails { Assert-RetirementStack $s.Scope $stack $phase } 'Exactly one source-owned Redis identity policy'
      }
    }
  }
  $tests['initial stack validation requires retained foundation and exactly one role per retained service'] = {
    $required = @($s.Scope.VaultId, $s.Scope.IdentityId, $s.Scope.AcsId, $s.RetainedIds[3])
    foreach ($phase in @('all', 'retained')) {
      foreach ($id in $required) {
        $stack = Copy-TestObject (New-TestStack $phase)
        $stack.resources = @($stack.resources | Where-Object { $_.id -ne $id })
        Assert-Fails { Assert-RetirementStack $s.Scope $stack $phase } 'Incomplete retained ownership'
      }
      foreach ($role in @($s.RetainedIds | Where-Object { $_ -like '*/roleAssignments/*' })) {
        foreach ($count in @(0, 2)) {
          $stack = Copy-TestObject (New-TestStack $phase)
          if ($count -eq 0) { $stack.resources = @($stack.resources | Where-Object { $_.id -ne $role }) }
          else { $stack.resources += [pscustomobject]@{ id = $role.Replace('33333333-3333-3333-3333-333333333333', '88888888-8888-8888-8888-888888888888') } }
          Assert-Fails { Assert-RetirementStack $s.Scope $stack $phase } 'single source-owned identity role assignment'
        }
      }
    }
  }
  $tests['AllowPartial and AllowFailed are independent and never bypass scope, ownership, or active-state checks'] = {
    $stack = Copy-TestObject (New-TestStack 'disposable')
    $stack.resources = @($stack.resources[0])
    $stack.provisioningState = 'Failed'
    Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed } 'Incomplete disposable ownership'
    Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowPartial } 'Stack must be succeeded'
    Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed -AllowPartial
    foreach ($scenario in @('unknown', 'mixed', 'scope', 'parameter', 'deny', 'active')) {
      $candidate = Copy-TestObject $stack
      $pattern = switch ($scenario) {
        'unknown' { $candidate.resources += [pscustomobject]@{ id = $s.Dns.ZoneId }; 'Unexpected stack resource' }
        'mixed' { $candidate.resources += [pscustomobject]@{ id = $s.Scope.VaultId }; 'owns a retained' }
        'scope' { $candidate.id += '-other'; 'Unexpected stack scope' }
        'parameter' { $candidate.parameters.environmentName.value = 'prod'; 'parameter environmentName' }
        'deny' { $candidate.denySettings.mode = 'denyDelete'; 'deny settings' }
        'active' { $candidate.provisioningState = 'Running'; 'Stack must be succeeded' }
      }
      Assert-Fails { Assert-RetirementStack $s.Scope $candidate 'disposable' -AllowFailed -AllowPartial } $pattern
    }
  }
  $tests['empty terminal-failure inventories require both retry flags and preserve all remaining safety checks'] = {
    foreach ($state in @('Succeeded', 'Failed', 'Canceled', 'Running')) {
      $stack = Copy-TestObject (New-TestStack 'disposable')
      $stack.resources = @()
      $stack.provisioningState = $state
      foreach ($allowFailed in @($false, $true)) {
        foreach ($allowPartial in @($false, $true)) {
          if ($state -in @('Failed', 'Canceled') -and $allowFailed -and $allowPartial) {
            Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed:$allowFailed -AllowPartial:$allowPartial
          } else {
            Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed:$allowFailed -AllowPartial:$allowPartial } 'Stack must be succeeded|empty or incomplete'
          }
        }
      }
    }
    foreach ($scenario in @('scope', 'parameter', 'deny')) {
      $stack = Copy-TestObject (New-TestStack 'disposable')
      $stack.resources = @()
      $stack.provisioningState = 'Failed'
      $pattern = switch ($scenario) {
        'scope' { $stack.id += '-other'; 'Unexpected stack scope' }
        'parameter' { $stack.parameters.environmentName.value = 'prod'; 'parameter environmentName' }
        'deny' { $stack.denySettings.mode = 'denyDelete'; 'deny settings' }
      }
      Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed -AllowPartial } $pattern
    }
  }
  $tests['AllowFailed never admits an in-progress or unknown stack state'] = {
    foreach ($state in @('Running', 'Creating', 'Updating', 'Deleting', 'Accepted', 'unknown', '')) {
      $stack = Copy-TestObject (New-TestStack 'disposable')
      $stack.provisioningState = $state
      Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed } 'Stack must be succeeded'
    }
  }
  $tests['failed-resource records require both retry flags and a terminal failure even with complete successful ownership'] = {
    foreach ($state in @('Succeeded', 'Failed', 'Canceled', 'Running', 'Creating', 'Updating', 'Deleting', 'unknown')) {
      foreach ($inventory in @('complete', 'partial', 'empty')) {
        $stack = New-TestStack 'disposable'
        $stack.provisioningState = $state
        if ($inventory -eq 'partial') { $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId }) }
        if ($inventory -eq 'empty') { $stack.resources = @() }
        $stack.failedResources = @(@{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } })
        $stack = Copy-TestObject $stack
        foreach ($allowFailed in @($false, $true)) {
          foreach ($allowPartial in @($false, $true)) {
            if ($state -in @('Failed', 'Canceled') -and $allowFailed -and $allowPartial) {
              Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed -AllowPartial
            } else {
              Assert-Fails { Assert-RetirementStack $s.Scope $stack 'disposable' -AllowFailed:$allowFailed -AllowPartial:$allowPartial } 'Stack must be succeeded|Failed-resource records require explicit terminal-failure recovery'
            }
          }
        }
      }
    }
    Assert-True ($s.Calls.Count -eq 0) 'failed-resource admission is a local validation only'
  }
  $tests['failed-resource inventory uses the same explicit allowlist and phase classification as successful resources'] = {
    foreach ($phase in @('all', 'retained', 'disposable')) {
      $stack = New-TestStack $phase
      $stack.provisioningState = 'Failed'
      $stack.failedResources = @($stack.resources | ForEach-Object { @{ id = $_.id.ToUpperInvariant(); error = @{ code = 'DeploymentFailed' } } })
      $stack.resources = @()
      Assert-RetirementStack $s.Scope (Copy-TestObject $stack) $phase -AllowFailed -AllowPartial
      if ($phase -ne 'all') {
        $wrongId = if ($phase -eq 'disposable') { $s.Scope.VaultId } else { $s.Scope.EnvironmentId }
        $stack.failedResources += @{ id = $wrongId; error = @{ code = 'DeploymentFailed' } }
        Assert-Fails { Assert-RetirementStack $s.Scope (Copy-TestObject $stack) $phase -AllowFailed -AllowPartial } 'owns a (retained|disposable) resource'
      }
    }
  }
  $tests['failed-resource evidence never fills missing successful ownership for full inventory validation'] = {
    foreach ($phase in @('all', 'retained', 'disposable')) {
      $candidateIds = if ($phase -eq 'retained') { @($s.Scope.VaultId, $s.RetainedIds[-1]) } else { @($s.Scope.EnvironmentId, "$($s.Scope.RedisId)/databases/default/accessPolicyAssignments/aparedis012345") }
      foreach ($id in $candidateIds) {
        $stack = New-TestStack $phase
        $stack.provisioningState = 'Failed'
        $stack.resources = @($stack.resources | Where-Object { $_.id -ne $id })
        $stack.failedResources = @(@{ id = $id; error = @{ code = 'DeploymentFailed' } })
        Assert-Fails { Assert-RetirementStack $s.Scope (Copy-TestObject $stack) $phase -AllowFailed } 'Failed-resource records require explicit terminal-failure recovery'
        Assert-RetirementStack $s.Scope (Copy-TestObject $stack) $phase -AllowFailed -AllowPartial
        $stack.failedResources = @()
        Assert-Fails { Assert-RetirementStack $s.Scope (Copy-TestObject $stack) $phase -AllowFailed } 'Incomplete .* ownership|Exactly one source-owned Redis identity policy|single source-owned identity role assignment'
      }
    }
  }
  $tests['failed-resource recovery still validates stack scope parameters and deny settings'] = {
    foreach ($scenario in @('scope', 'parameter', 'deny')) {
      $stack = New-TestStack 'disposable'
      $stack.resources = @()
      $stack.failedResources = @(@{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } })
      $stack.provisioningState = 'Failed'
      $pattern = switch ($scenario) {
        'scope' { $stack.id += '-other'; 'Unexpected stack scope' }
        'parameter' { $stack.parameters.environmentName.value = 'prod'; 'parameter environmentName' }
        'deny' { $stack.denySettings.mode = 'denyDelete'; 'deny settings' }
      }
      Assert-Fails { Assert-RetirementStack $s.Scope (Copy-TestObject $stack) 'disposable' -AllowFailed -AllowPartial } $pattern
    }
  }
  foreach ($scenario in @('subscription', 'resource-group', 'environment-name', 'environment-child', 'retained-service', 'platform-dns', 'managed-network', 'unowned-nic', 'empty-id')) {
    $name = "failed-resource records cannot authorize arbitrary ownership or deletion: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      Set-TestPrepared
      $s.Tags['acme:retirement'] = 'rebuilding'
      $stack = $s.Stacks[$s.Scope.DisposableStack]
      $stack.provisioningState = 'Failed'
      $id = switch ($scenario) {
        'subscription' { $s.Scope.EnvironmentId.Replace($s.Scope.Subscription, $s.Scope.PlatformSubscription) }
        'resource-group' { $s.Scope.EnvironmentId.Replace($s.Scope.Group, 'rg-other-dev-cus-01') }
        'environment-name' { "$($s.Scope.EnvironmentId)-other" }
        'environment-child' { "$($s.Scope.EnvironmentId)/managedCertificates/unowned" }
        'retained-service' { $s.Scope.VaultId }
        'platform-dns' { $s.Dns.ZoneId }
        'managed-network' { "/subscriptions/$($s.Scope.Subscription)/resourceGroups/$($s.Scope.InfrastructureGroup)/providers/Microsoft.Network/publicIPAddresses/unowned" }
        'unowned-nic' { $s.NicIds[0] }
        'empty-id' { '' }
      }
      $stack.failedResources = @(
        @{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } },
        @{ id = $id; error = @{ code = 'DeploymentFailed' } }
      )
      $pattern = if ($scenario -eq 'retained-service') { 'owns a retained resource' } else { 'Unexpected stack resource' }
      foreach ($emptyInventory in @($false, $true)) {
        if ($emptyInventory) { $stack.resources = @() }
        Assert-Fails { Invoke-TestRetirement 'retire' } $pattern
      }
      Assert-True ($s.Events.Count -eq 0 -and $s.Tags['acme:retirement'] -eq 'rebuilding') 'invalid failed record blocks all mutations despite valid environment evidence'
      Assert-True ($s.Resources.ContainsKey($s.Scope.EnvironmentId) -and $s.Apps.Count -eq 2) 'failed array cannot grant arbitrary deletion authority'
      Assert-TestRetained
    }
  }
  $tests['fingerprint follows all metadata pages and is insensitive to page ordering'] = {
    $before = Get-RetirementProtectedFingerprint $s.Scope
    Assert-True ($before -cmatch '^[a-f0-9]{64}$' -and $s.SecretReads -eq 2) 'hash covers both metadata pages'
    $all = @($s.Pages[$s.NextUri].value) + @($s.Pages[$s.SecretUri].value)
    $s.Pages[$s.SecretUri] = @{ value = $all }
    Assert-True ((Get-RetirementProtectedFingerprint $s.Scope) -ceq $before) 'same versions hash equally across order and pagination'
    Assert-True ($s.Events.Count -eq 0) 'fingerprint reads metadata only'
  }
  foreach ($field in @('secret-version', 'secret-added', 'principalId', 'clientId', 'tenantId')) {
    $name = "fingerprint changes when $field changes"
    $testArguments[$name] = $field
    $tests[$name] = {
      param($field)
      $before = Get-RetirementProtectedFingerprint $s.Scope
      switch ($field) {
        'secret-version' { $s.Pages[$s.NextUri].value[1].properties.secretUriWithVersion += '-new' }
        'secret-added' { $s.Pages[$s.NextUri].value += @{ properties = @{ secretUriWithVersion = 'https://fixture.vault.azure.net/secrets/extra/version-1' } } }
        'tenantId' { $s.Resources[$s.Scope.VaultId].properties.tenantId = '77777777-7777-7777-7777-777777777777' }
        default { $s.Resources[$s.Scope.IdentityId].properties[$field] = '77777777-7777-7777-7777-777777777777' }
      }
      Assert-True ((Get-RetirementProtectedFingerprint $s.Scope) -cne $before) 'retained drift is detectable'
    }
  }
  foreach ($scenario in @('host', 'scheme', 'path', 'repeat')) {
    $name = "fingerprint rejects unsafe or repeated pagination: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      $next = switch ($scenario) {
        'host' { $s.NextUri.Replace('management.azure.com', 'untrusted.example.test') }
        'scheme' { $s.NextUri.Replace('https:', 'http:') }
        'path' { $s.NextUri.Replace('/secrets?', '/secrets/other?') }
        'repeat' { $s.SecretUri }
      }
      $s.Pages[$s.SecretUri].nextLink = $next
      Assert-Fails { Get-RetirementProtectedFingerprint $s.Scope } 'Unsafe or repeated'
      Assert-True ($s.SecretReads -eq 1) 'unsafe continuation never reaches CLI boundary'
    }
  }
  $tests['fingerprint rejects incomplete metadata and weakened retained security'] = {
    $s.Pages[$s.NextUri].value = @($s.Pages[$s.NextUri].value[0])
    Assert-Fails { Get-RetirementProtectedFingerprint $s.Scope } 'metadata is incomplete'
    Reset-TestState
    $s = $global:retirementTest
    $s.Pages[$s.NextUri].value[1].properties.secretUriWithVersion = ''
    Assert-Fails { Get-RetirementProtectedFingerprint $s.Scope } 'metadata is incomplete'
    $s.Resources[$s.Scope.VaultId].properties.publicNetworkAccess = 'Enabled'
    Assert-Fails { Get-RetirementProtectedFingerprint $s.Scope } 'security settings'
    $s.Resources[$s.Scope.VaultId].properties.publicNetworkAccess = 'Disabled'
    $s.Resources[$s.Scope.AcsId].properties.disableLocalAuth = $false
    Assert-Fails { Get-RetirementProtectedFingerprint $s.Scope } 'security settings'
  }
  $tests['fingerprint bounds pagination to one hundred requests'] = {
    $first = $s.Pages[$s.SecretUri].value
    $current = $s.SecretUri
    foreach ($page in 1..101) {
      $next = $s.SecretUri + '&$skiptoken=offline-' + $page
      $s.Pages[$current] = @{ value = $first; nextLink = $next }
      $current = $next
    }
    Assert-Fails { Get-RetirementProtectedFingerprint $s.Scope } 'Unsafe or repeated'
    Assert-True ($s.SecretReads -eq 100) 'unbounded continuation stops before request 101'
  }
  $tests['image metadata records matching tag, both immutable digests, and BFF version'] = {
    $metadata = Get-RetirementImageMetadata $s.Scope (Copy-TestObject @($s.Apps.Values)) (Copy-TestObject $s.Tags)
    Assert-True ($metadata.Count -eq 4 -and $metadata['acme:recovery-image-tag'] -ceq $s.Tag) 'only approved recovery metadata returned'
    Assert-True ($metadata['acme:recovery-web-digest'] -ceq $s.WebDigest) 'web digest recorded'
    Assert-True ($metadata['acme:recovery-bff-digest'] -ceq $s.BffDigest) 'BFF digest recorded'
    Assert-True ($metadata['acme:recovery-bff-version'] -ceq '1.2.3') 'BFF version recorded'
    foreach ($kind in @('web', 'bff')) {
      $container = $s.Apps["ca-acme-los-$kind-dev-cus-01"].properties.template.containers[0]
      $digest = if ($kind -eq 'web') { $s.WebDigest } else { $s.BffDigest }
      $container.image = $container.image.Split(':')[0] + '@' + $digest
    }
    foreach ($entry in $metadata.GetEnumerator()) { $s.Tags[$entry.Key] = $entry.Value }
    $pinned = Get-RetirementImageMetadata $s.Scope (Copy-TestObject @($s.Apps.Values)) (Copy-TestObject $s.Tags)
    Assert-True ($pinned['acme:recovery-web-digest'] -ceq $metadata['acme:recovery-web-digest']) 'digest-pinned recovery supported'
  }
  $tests['approved same-build digests cannot change even when new-build preparation is allowed'] = {
    Set-TestPrepared
    foreach ($kind in @('web', 'bff')) {
      $saved = $s.Tags["acme:recovery-$kind-digest"]
      foreach ($previous in @(('sha256:' + ('e' * 64)), $null)) {
        if ($null -eq $previous) { $s.Tags.Remove("acme:recovery-$kind-digest") }
        else { $s.Tags["acme:recovery-$kind-digest"] = $previous }
        foreach ($allow in @($false, $true)) {
          Assert-Fails { Get-RetirementImageMetadata $s.Scope (Copy-TestObject @($s.Apps.Values)) (Copy-TestObject $s.Tags) -AllowNewBuild:$allow } 'Recorded recovery image digest changed'
        }
        $s.Tags["acme:recovery-$kind-digest"] = $saved
      }
    }
    Assert-True ($s.Events.Count -eq 0) 'digest evidence never changes implicitly'
  }
  $tests['a different running release requires AllowNewBuild and explicit prepare before retirement'] = {
    Set-TestPrepared
    $oldTag = $s.Tag
    $newTag = ('d' * 40) + '-dev'
    foreach ($app in $s.Apps.Values) {
      $app.properties.template.containers[0].image = $app.properties.template.containers[0].image.Replace($oldTag, $newTag)
      $app.properties.template.containers[0].env[0].value = 'dddddddd'
    }
    Assert-Fails { Get-RetirementImageMetadata $s.Scope (Copy-TestObject @($s.Apps.Values)) (Copy-TestObject $s.Tags) } 'different build is running'
    $metadata = Get-RetirementImageMetadata $s.Scope (Copy-TestObject @($s.Apps.Values)) (Copy-TestObject $s.Tags) -AllowNewBuild
    Assert-True ($metadata['acme:recovery-image-tag'] -ceq $newTag) 'opt-in validates the new release'
    Assert-Fails { Invoke-TestRetirement 'retire' } 'different build is running'
    Assert-True ($s.Events.Count -eq 0 -and $s.Tags['acme:recovery-image-tag'] -ceq $oldTag) 'retire cannot adopt a new release'
    Invoke-TestRetirement 'prepare' | Out-Null
    Assert-True ($s.Tags['acme:recovery-image-tag'] -ceq $newTag -and $s.Tags['acme:retirement'] -eq 'active') 'explicit prepare records the approved release'
    Assert-NoTestDeletes
    Invoke-TestRetirement 'retire' | Out-Null
    Assert-True ($s.Tags['acme:retirement'] -eq 'retired') 'new release can retire only after preparation'
  }
  $tests['retire and prepare both reject a retargeted approved image tag before mutation'] = {
    Set-TestPrepared
    $s.BffDigest = 'sha256:' + ('e' * 64)
    foreach ($action in @('prepare', 'retire')) { Assert-Fails { Invoke-TestRetirement $action } 'Recorded recovery image digest changed' }
    Assert-True ($s.Events.Count -eq 0) 'retargeted tag cannot rewrite recovery evidence'
  }
  foreach ($scenario in @('registry', 'repository', 'tag', 'digest-drift', 'invalid-digest', 'build', 'different-builds', 'version', 'environment', 'missing-app', 'multiple-containers', 'duplicate-build')) {
    $name = "image metadata fails closed: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      $web = $s.Apps[$s.Scope.AppNames[0]].properties.template.containers[0]
      $bff = $s.Apps[$s.Scope.AppNames[1]].properties.template.containers[0]
      $pattern = 'Recovery requires'
      switch ($scenario) {
        'registry' { $web.image = $web.image.Replace($s.Scope.Registry, 'otherregistry') }
        'repository' { $web.image = $web.image.Replace('acme-los-web:', 'other:') }
        'tag' { $web.image = $web.image.Replace($s.Tag, 'latest') }
        'digest-drift' { $web.image = $web.image.Split(':')[0] + '@sha256:' + ('d' * 64); $s.Tags['acme:recovery-image-tag'] = $s.Tag; $pattern = 'digest does not match' }
        'invalid-digest' { $s.WebDigest = 'sha256:invalid'; $pattern = 'digest does not match' }
        'build' { $web.env[0].value = 'bbbbbbbb'; $pattern = 'build and image tag disagree' }
        'different-builds' { $bff.image = $bff.image.Replace($s.Tag, ('d' * 40) + '-dev'); $bff.env[0].value = 'dddddddd'; $pattern = 'same approved build' }
        'version' { $bff.env[1].value = 'latest'; $pattern = 'BFF application version' }
        'environment' { $s.Apps[$s.Scope.AppNames[0]].properties.environmentId = 'other-environment'; $pattern = 'Both source-owned apps' }
        'missing-app' { $s.Apps.Remove($s.Scope.AppNames[1]); $pattern = 'Both source-owned apps' }
        'multiple-containers' { $s.Apps[$s.Scope.AppNames[0]].properties.template.containers += $web; $pattern = 'Both source-owned apps' }
        'duplicate-build' { $web.env += @{ name = 'APP_BUILD_ID'; value = 'aaaaaaaa' }; $pattern = 'build and image tag disagree' }
      }
      Assert-Fails { Get-RetirementImageMetadata $s.Scope (Copy-TestObject @($s.Apps.Values)) (Copy-TestObject $s.Tags) } $pattern
      Assert-True ($s.Events.Count -eq 0) 'invalid images never trigger mutations'
    }
  }
  $tests['CNAME preview is read-only and clearing works with locked zone and preserves TXT'] = {
    Clear-RetirementCname $s.Dns
    Assert-True ($s.Events.Count -eq 0) 'preview never writes'
    Clear-RetirementCname $s.Dns -Apply
    Assert-True ($s.Resources.ContainsKey($s.CnameId) -and -not $s.Resources[$s.CnameId].properties.PSObject.Properties['CNAMERecord']) 'empty CNAME retained and read back'
    Assert-TestRetained
    Clear-RetirementCname $s.Dns -Apply
    Assert-True (@($s.Events | Where-Object { $_ -eq 'clear:cname' }).Count -eq 1) 'empty CNAME is an idempotent no-op'
  }
  $tests['absent and null CNAME targets are idempotent without deleting the record set'] = {
    $s.Resources[$s.CnameId].properties.CNAMERecord = $null
    Clear-RetirementCname $s.Dns -Apply
    $s.Resources.Remove($s.CnameId)
    Clear-RetirementCname $s.Dns -Apply
    Assert-True ($s.Events.Count -eq 0) 'no mutation for already unpublished alias'
  }
  foreach ($scenario in @('owner', 'etag', 'target', 'cname-race', 'cname-stuck')) {
    $name = "CNAME clearing fails closed: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      $pattern = 'source ownership and ETag'
      switch ($scenario) {
        'owner' { $s.Resources[$s.CnameId].properties.metadata['acme-owner'] = 'other-owner' }
        'etag' { $s.Resources[$s.CnameId].etag = '' }
        'target' { $s.Resources[$s.CnameId].properties.CNAMERecord.cname = 'other.example.test'; $pattern = 'outside the dev' }
        'cname-race' { $s.Failure = $scenario; $pattern = 'Azure DNS request failed' }
        'cname-stuck' { $s.Failure = $scenario; $pattern = 'did not converge' }
      }
      Assert-Fails { Clear-RetirementCname $s.Dns -Apply } $pattern
      Assert-True ($s.Resources.ContainsKey($s.CnameId)) 'failed update retains record set'
      if ($scenario -in @('owner', 'etag', 'target')) { Assert-NoTestDeletes }
    }
  }
  $tests['phase preparation uses detachAll and removes temporary parameters after success and failure'] = {
    $parameters = Copy-TestObject $s.Stacks[$s.Scope.RetainedStack].parameters
    foreach ($property in $parameters.PSObject.Properties) { $property.Value | Add-Member -NotePropertyName reference -NotePropertyValue $null }
    foreach ($phase in @('retained', 'disposable')) {
      Invoke-RetirementPhase $s.Scope $parameters $phase -ValidateOnly
      Invoke-RetirementPhase $s.Scope $parameters $phase
    }
    Assert-True (($s.Events -join ',') -ceq 'validate:retained,create:retained,validate:disposable,create:disposable') 'both phases validated and detached'
    Assert-NoTestDeletes
    $s.Failure = 'create-disposable'
    Assert-Fails { Invoke-RetirementPhase $s.Scope $parameters 'disposable' } 'Azure DNS request failed'
  }
  $tests['phase preparation accepts ARM value parameters without an optional reference property'] = {
    Invoke-RetirementPhase $s.Scope (Copy-TestObject $s.Stacks[$s.Scope.RetainedStack].parameters) 'retained' -ValidateOnly
    Assert-True ($s.Events.Contains('validate:retained')) 'ordinary ARM parameters can be prepared'
  }
  $tests['phase preparation rejects secret-bearing types and references before CLI invocation'] = {
    foreach ($type in @('secureString', 'secureObject', 'unexpected')) {
      $parameters = Copy-TestObject @{ sensitive = @{ type = $type; value = $null; reference = $null } }
      Assert-Fails { Invoke-RetirementPhase $s.Scope $parameters 'retained' } 'never exports secret-bearing'
    }
    $parameters = Copy-TestObject @{ referenceOnly = @{ type = 'string'; value = $null; reference = @{ keyVault = @{ id = $s.Scope.VaultId }; secretName = 'fixture' } } }
    Assert-Fails { Invoke-RetirementPhase $s.Scope $parameters 'retained' } 'never exports secret-bearing'
    Assert-True ($s.Calls.Count -eq 0) 'secret-bearing parameters never reach Azure or a payload file'
  }
  $tests['show-plan runs real preflights without mutation'] = {
    $plan = Invoke-TestRetirement 'show-plan' | ConvertFrom-Json
    Assert-True ($plan.state -eq 'active' -and $plan.ownership -eq 'all') 'reports current state and ownership'
    Assert-True (-not $plan.disposableStackExists -and $plan.hostname -eq $s.Dns.Hostname) 'reports source domain and unsplit stack'
    Assert-True ($s.SecretReads -eq 2) 'protected metadata is actually checked'
    Assert-True ($s.Events.Count -eq 0) 'show-plan never mutates'
  }
  $tests['typed not-found signal survives redaction while authorization failures remain failures'] = {
    $id = "$($s.Scope.Id)/providers/Microsoft.App/containerApps/$($s.Scope.AppNames[0])"
    $s.Apps.Remove($s.Scope.AppNames[0])
    $caught = $null
    try { Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', "${id}?api-version=2025-01-01") } catch { $caught = $_.Exception }
    Assert-True ($null -ne $caught -and $caught.Data['AzureResourceNotFound'] -is [bool] -and $caught.Data['AzureResourceNotFound']) 'missing resource produces a typed flag'
    Assert-True ($caught.Message -notmatch 'Synthetic|ResourceNotFound') 'provider message is not exposed'
    Assert-True ($null -eq (Get-ConnectivityResource $id '2025-01-01')) 'connectivity wrapper recognizes actual absence'
    $s.Failure = 'app403'
    foreach ($allowMissing in @($false, $true)) {
      $caught = $null
      try { Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', "${id}?api-version=2025-01-01") -AllowMissing:$allowMissing } catch { $caught = $_.Exception }
      Assert-True ($null -ne $caught -and $caught.Data['AzureResourceNotFound'] -is [bool] -and -not $caught.Data['AzureResourceNotFound']) 'authorization cannot become not-found'
      Assert-True ($caught.Message -notmatch 'Synthetic|AuthorizationFailed') 'access-denial payload is redacted'
    }
    Assert-Fails { Get-ConnectivityResource $id '2025-01-01' } 'Azure DNS request failed'
  }
  $tests['recovery skips registry, private DNS link, and monitoring writes while ordinary deploy still writes'] = {
    $writes = [Collections.Generic.List[string]]::new()
    function Invoke-AzNoOutput { param([string[]]$Arguments) $writes.Add(($Arguments -join ' ')) }
    $imagesSubscriptionDeploymentArguments = @('fixture-images-sub')
    $imagesResourceGroupDeploymentArguments = @('fixture-images-group')
    $platformWorkloadLinksDeploymentArguments = @('fixture-private-dns-links')
    $monitoringDeploymentArguments = @('fixture-monitoring')
    foreach ($recovery in @($false, $true)) {
      $RecoverRetiredResourceGroup = if ($recovery) { $s.Scope.Group } else { '' }
      $preserveFoundation = $recovery
      $runtimeRegion = [pscustomobject]@{ Relocated = $false }
      $writes.Clear()
      foreach ($variable in @('imagesSubscriptionDeploymentArguments', 'platformWorkloadLinksDeploymentArguments', 'monitoringDeploymentArguments')) {
        . (Get-TestDeploymentBlock $variable)
      }
      Assert-True ($writes.Count -eq $(if ($recovery) { 0 } else { 4 })) 'recovery preserves retained services; ordinary deploy behavior remains live'
    }
  }
  $tests['recovery reads retained stack and Entra outputs without redeploying them'] = {
    $reads = [Collections.Generic.List[object]]::new()
    $writes = [Collections.Generic.List[object]]::new()
    $retained = Copy-TestObject (New-TestStack 'retained')
    $entraOutputs = [pscustomobject]@{ bffApiApplicationClientId = [pscustomobject]@{ value = 'fixture-client' } }
    function Invoke-AzJson {
      param([string[]]$Arguments)
      $reads.Add($Arguments)
      if (($Arguments[0..2] -join ' ') -eq 'stack group show') { return $retained }
      Assert-True (($Arguments[0..2] -join ' ') -eq 'deployment group show') 'existing Entra outputs only'
      return [pscustomobject]@{ outputs = $entraOutputs }
    }
    function Invoke-AzNoOutput { param([string[]]$Arguments) $writes.Add($Arguments) }
    $EnvironmentName = 'dev'
    $RecoverRetiredResourceGroup = $s.Scope.Group
    $preserveFoundation = $true
    $configuration = [pscustomobject]@{ organizationShortName = 'acme'; workloadShortName = 'los'; primaryRegionShortName = 'cus' }
    $foundationResourceGroupName = $s.Scope.FoundationGroup
    $resolvedSubscriptionId = $s.Scope.Subscription
    $resourceGroupName = $s.Scope.Group
    $resourceGroupStackName = $s.Scope.RetainedStack
    $webDeploymentArguments = @('stack', 'group', 'create', '--name', $resourceGroupStackName, '--action-on-unmanage', 'deleteResources')
    . (Get-TestDeploymentBlock 'retainedArguments')
    . (Get-TestDeploymentBlock 'entraServiceAuthDeployment' -Assignment)
    Assert-True ($reads.Count -eq 2 -and $writes.Count -eq 0) 'retained foundation and Entra are read, not redeployed'
    Assert-True ((Get-TestArgument $reads[0] '--name') -eq $s.Scope.RetainedStack) 'reads original retained stack'
    Assert-True ($resourceGroupStackName -eq $s.Scope.DisposableStack -and $webDeploymentArguments -contains 'resourcePhase=disposable') 'subsequent deployment targets only disposable phase'
    Assert-True ($entraServiceAuthDeployment.outputs.bffApiApplicationClientId.value -eq 'fixture-client') 'existing Entra output propagated'
    $retained.provisioningState = 'Failed'
    $resourceGroupStackName = $s.Scope.RetainedStack
    Assert-Fails { . (Get-TestDeploymentBlock 'retainedArguments') } 'healthy retained foundation'
  }
  $tests['recovery refuses missing monitoring and never syncs retained workbooks'] = {
    function Invoke-AzNoOutput { throw 'Unexpected retained monitoring write' }
    $RecoverRetiredResourceGroup = $s.Scope.Group
    $preserveFoundation = $true
    $runtimeRegion = [pscustomobject]@{ Relocated = $false }
    $platformMonitoringStackName = 'fixture-monitor-stack'
    $monitoringStacks = @([pscustomobject]@{ name = $platformMonitoringStackName })
    . (Get-TestDeploymentBlock 'monitoringBootstrapArguments')
    $monitoringStacks = @()
    Assert-Fails { . (Get-TestDeploymentBlock 'monitoringBootstrapArguments') } 'retained monitoring stack is missing'
    $workbookResourceName = 'fixture-workbook'
    $workbookDisplayName = 'Fixture workbook'
    $WorkbookSyncScriptFile = 'Invoke-ForbiddenWorkbookSync'
    function Invoke-ForbiddenWorkbookSync { throw 'Unexpected workbook mutation' }
    . (Get-TestDeploymentBlock 'workbookResourceName')
  }
  $tests['destructive confirmations fail before any Azure call'] = {
    Assert-Fails { Invoke-TestRetirement 'prepare' @{ ConfirmResourceGroup = 'wrong-group' } } 'ConfirmResourceGroup'
    Assert-Fails { Invoke-TestRetirement 'retire' @{ DiscardDemoData = $false } } 'DiscardDemoData'
    Assert-True ($s.Calls.Count -eq 0) 'confirmation checked before CLI'
  }
  $tests['orchestration permits terminal disposable failures only during explicit interrupted retirement'] = {
    foreach ($marker in @('retiring', 'rebuilding')) {
      foreach ($state in @('Failed', 'Canceled')) {
        Reset-TestState
        $s = $global:retirementTest
        Set-TestPrepared
        $s.Tags['acme:retirement'] = $marker
        $s.Stacks[$s.Scope.DisposableStack].provisioningState = $state
        $s.Failure = 'alert-stuck'
        Assert-Fails { Invoke-TestRetirement 'retire' } 'Alert state did not converge'
        Assert-True ($s.Events.Contains('marker:retiring') -and $s.Events.Contains('alert:False')) 'explicit retry passes terminal-state gate'
        Assert-NoTestDeletes
      }
    }
  }
  $tests['active retirement and show-plan cannot opt into failed stack retry implicitly'] = {
    foreach ($action in @('retire', 'show-plan')) {
      foreach ($state in @('Failed', 'Canceled', 'Running')) {
        Reset-TestState
        $s = $global:retirementTest
        Set-TestPrepared
        $s.Stacks[$s.Scope.DisposableStack].provisioningState = $state
        Assert-Fails { Invoke-TestRetirement $action } 'Stack must be succeeded'
        Assert-True ($s.Events.Count -eq 0) 'unapproved failed stack prevents all mutations'
      }
    }
  }
  $tests['retry refuses active disposable stacks and failed retained stacks'] = {
    foreach ($target in @('active-disposable', 'failed-retained')) {
      Reset-TestState
      $s = $global:retirementTest
      Set-TestPrepared
      $s.Tags['acme:retirement'] = 'retiring'
      if ($target -eq 'active-disposable') { $s.Stacks[$s.Scope.DisposableStack].provisioningState = 'Running' }
      else { $s.Stacks[$s.Scope.RetainedStack].provisioningState = 'Failed' }
      Assert-Fails { Invoke-TestRetirement 'retire' } 'Stack must be succeeded'
      Assert-True ($s.Events.Count -eq 0) 'retry cannot bypass active operation or retained stack validation'
    }
  }
  $tests['prepare separates ownership without deleting runtime resources'] = {
    $before = @($s.Resources.Keys | Sort-Object) -join ','
    Invoke-TestRetirement 'prepare' | Out-Null
    Assert-True (($s.Events -join ',') -ceq 'validate:retained,validate:disposable,marker:preparing,create:retained,create:disposable,marker:active') 'both validations precede ownership mutation'
    Assert-True ((@($s.Resources.Keys | Sort-Object) -join ',') -ceq $before -and $s.Apps.Count -eq 2) 'all runtime resources and both apps preserved'
    Assert-True ($s.Tags['acme:recovery-web-digest'] -ceq $s.WebDigest -and $s.Tags['acme:recovery-retained-hash']) 'recovery metadata persisted'
    Assert-NoTestDeletes
    Invoke-TestRetirement 'prepare' | Out-Null
    Assert-True ($s.Stacks.Count -eq 2 -and $s.Tags['acme:retirement'] -eq 'active') 'repeat preparation is safe'
  }
  foreach ($missing in @('environment', 'kv-endpoint', 'redis-endpoint')) {
    $name = "initial retirement rejects missing disposable ownership before any mutation: $missing"
    $testArguments[$name] = $missing
    $tests[$name] = {
      param($missing)
      Set-TestPrepared
      $id = switch ($missing) {
        'environment' { $s.Scope.EnvironmentId }
        'kv-endpoint' { "$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01" }
        'redis-endpoint' { "$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-redis-dev-cus-01" }
      }
      $stack = $s.Stacks[$s.Scope.DisposableStack]
      $stack.resources = @($stack.resources | Where-Object { $_.id -ne $id })
      Assert-Fails { Invoke-TestRetirement 'retire' } 'Incomplete disposable ownership'
      Assert-True ($s.Events.Count -eq 0 -and $s.Tags['acme:retirement'] -eq 'active') 'incomplete inventory fails before markers, alerts, or deletion'
      Assert-True ($s.Resources.ContainsKey($id) -and $s.Apps.Count -eq 2) 'unowned service and apps remain untouched'
    }
  }
  $tests['initial preparation cannot implicitly opt into partial ownership'] = {
    $stack = $s.Stacks[$s.Scope.RetainedStack]
    $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId })
    Assert-Fails { Invoke-TestRetirement 'prepare' } 'Incomplete disposable ownership'
    Assert-True ($s.Events.Count -eq 0) 'active preparation requires complete original inventory'
  }
  $tests['preparing retries an empty persisted Failed or Canceled disposable stack but fresh retirement rejects it'] = {
    foreach ($state in @('Failed', 'Canceled')) {
      Reset-TestState
      $s = $global:retirementTest
      Set-TestPrepared
      $stack = $s.Stacks[$s.Scope.DisposableStack]
      $stack.resources = @()
      Assert-Fails { Invoke-TestRetirement 'retire' } 'empty or incomplete'
      $stack.provisioningState = $state
      Assert-Fails { Invoke-TestRetirement 'retire' } 'Stack must be succeeded'
      Assert-True ($s.Events.Count -eq 0) 'fresh retirement cannot opt into empty-stack recovery'
      $s.Tags['acme:retirement'] = 'preparing'
      $before = @($s.Resources.Keys | Sort-Object) -join ','
      Invoke-TestRetirement 'prepare' | Out-Null
      Assert-RetirementStack $s.Scope (Copy-TestObject $s.Stacks[$s.Scope.RetainedStack]) 'retained'
      Assert-RetirementStack $s.Scope (Copy-TestObject $s.Stacks[$s.Scope.DisposableStack]) 'disposable'
      Assert-True ($s.Tags['acme:retirement'] -eq 'active' -and $s.Stacks[$s.Scope.DisposableStack].resources.Count -eq 10) 'preparation re-adopts complete disposable ownership'
      Assert-True ((@($s.Resources.Keys | Sort-Object) -join ',') -ceq $before -and $s.Apps.Count -eq 2) 'empty-stack retry preserves every runtime resource'
      Assert-NoTestDeletes
    }
  }
  foreach ($state in @('Failed', 'Canceled')) {
    $name = "interrupted preparation retries both persisted partial stacks: $state"
    $testArguments[$name] = $state
    $tests[$name] = {
      param($state)
      Set-TestPrepared
      $s.Tags['acme:retirement'] = 'preparing'
      $retained = $s.Stacks[$s.Scope.RetainedStack]
      $retained.provisioningState = $state
      $retained.resources = @($retained.resources | Where-Object { $_.id -ne $s.Scope.AcsId }) + @(@{ id = $s.Scope.EnvironmentId })
      $disposable = $s.Stacks[$s.Scope.DisposableStack]
      $disposable.provisioningState = $state
      $disposable.resources = @($disposable.resources[0])
      $before = @($s.Resources.Keys | Sort-Object) -join ','
      $fingerprint = Get-RetirementProtectedFingerprint $s.Scope
      Invoke-TestRetirement 'prepare' | Out-Null
      Assert-True (($s.Events -join ',') -ceq 'validate:retained,validate:disposable,marker:preparing,create:retained,create:disposable,marker:active') 'retry validates both phases before idempotent adoption'
      Assert-RetirementStack $s.Scope (Copy-TestObject $s.Stacks[$s.Scope.RetainedStack]) 'retained'
      Assert-RetirementStack $s.Scope (Copy-TestObject $s.Stacks[$s.Scope.DisposableStack]) 'disposable'
      Assert-True ((@($s.Resources.Keys | Sort-Object) -join ',') -ceq $before -and $s.Apps.Count -eq 2) 'retry changes stack ownership only'
      Assert-True ((Get-RetirementProtectedFingerprint $s.Scope) -ceq $fingerprint) 'retained identity and secret versions preserved'
      Assert-NoTestDeletes
    }
  }
  foreach ($target in @('retained', 'disposable')) {
    $name = "preparation retry rejects active or unknown persisted ownership: $target"
    $testArguments[$name] = $target
    $tests[$name] = {
      param($target)
      Set-TestPrepared
      $s.Tags['acme:retirement'] = 'preparing'
      $stackName = if ($target -eq 'retained') { $s.Scope.RetainedStack } else { $s.Scope.DisposableStack }
      $stack = $s.Stacks[$stackName]
      $stack.provisioningState = 'Running'
      Assert-Fails { Invoke-TestRetirement 'prepare' } 'Stack must be succeeded'
      $stack.provisioningState = 'Failed'
      $stack.resources += @{ id = $s.Dns.ZoneId }
      Assert-Fails { Invoke-TestRetirement 'prepare' } 'Unexpected stack resource'
      Assert-True ($s.Events.Count -eq 0) 'retry flags do not authorize active or unknown resources'
    }
  }
  $tests['retirement retry permits partial failed ownership only for an explicitly interrupted operation'] = {
    Set-TestPrepared
    $stack = $s.Stacks[$s.Scope.DisposableStack]
    $stack.provisioningState = 'Failed'
    $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId })
    $s.Resources.Remove($s.Scope.EnvironmentId)
    Assert-Fails { Invoke-TestRetirement 'retire' } 'Stack must be succeeded'
    Assert-True ($s.Events.Count -eq 0) 'active state cannot authorize partial failed ownership'
    $s.Tags['acme:retirement'] = 'retiring'
    Invoke-TestRetirement 'retire' | Out-Null
    Assert-True ($s.Tags['acme:retirement'] -eq 'retired') 'explicit interrupted retirement converges from partial inventory'
    Assert-TestRetained
  }
  $tests['failed environment records reject succeeded history and non-retry markers before mutation'] = {
    Set-TestPrepared
    $stack = $s.Stacks[$s.Scope.DisposableStack]
    $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId })
    $stack.failedResources = @(@{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } })
    foreach ($marker in @('active', 'retired', 'retiring', 'rebuilding')) {
      $s.Tags['acme:retirement'] = $marker
      $stack.provisioningState = 'Succeeded'
      Assert-Fails { Invoke-TestRetirement 'retire' } 'Failed-resource records require explicit terminal-failure recovery'
      if ($marker -in @('active', 'retired')) {
        $stack.provisioningState = 'Failed'
        Assert-Fails { Invoke-TestRetirement 'retire' } 'Stack must be succeeded'
      }
      Assert-True ($s.Events.Count -eq 0 -and $s.Tags['acme:retirement'] -eq $marker) 'failure history alone cannot authorize recovery or rewrite markers'
    }
    Assert-NoTestDeletes
    Assert-TestRetained
  }
  foreach ($state in @('Failed', 'Canceled')) {
    foreach ($marker in @('retiring', 'rebuilding')) {
      $name = "capacity-failed environment recorded only in failedResources is deleted before stack cleanup: $state $marker"
      $testArguments[$name] = @{ State = $state; Marker = $marker }
      $tests[$name] = {
        param($case)
        Set-TestPrepared
        $s.Tags['acme:retirement'] = $case.Marker
        $s.Apps.Clear()
        $stack = $s.Stacks[$s.Scope.DisposableStack]
        $stack.provisioningState = $case.State
        $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId -and -not $_.id.StartsWith("$($s.Scope.EnvironmentId)/") })
        $stack.failedResources = @(@{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } })
        foreach ($id in @($s.Resources.Keys | Where-Object { $_.StartsWith("$($s.Scope.EnvironmentId)/") })) { $s.Resources.Remove($id) }
        $s.Resources[$s.Scope.EnvironmentId].properties.provisioningState = 'Failed'
        $before = Get-RetirementProtectedFingerprint $s.Scope
        Assert-True (@($stack.resources | Where-Object { $_.id -eq $s.Scope.EnvironmentId }).Count -eq 0) 'actual failed environment is not in successful stack resources'
        Invoke-TestRetirement 'retire' | Out-Null
        Assert-True ((@($s.Events | Where-Object { $_ -like 'delete:*' }) -join ',') -ceq 'delete:endpoint:kv,delete:endpoint:redis,delete:redis,delete:environment,delete:disposable') 'failed environment uses explicit owning-service deletion before remaining stack'
        Assert-True ($s.EnvironmentAbsenceConfirmed -and -not $s.Resources.ContainsKey($s.Scope.EnvironmentId)) 'failed-only environment absence is independently confirmed'
        Assert-True ($s.Tags['acme:retirement'] -eq 'retired' -and -not $s.Stacks.ContainsKey($s.Scope.DisposableStack)) 'partial rebuild cleanup converges'
        Assert-True ((Get-RetirementProtectedFingerprint $s.Scope) -ceq $before) 'capacity recovery preserves retained identity and secret versions'
        Assert-TestRetained
        $s.Events.Clear()
        Invoke-TestRetirement 'retire' | Out-Null
        Assert-NoTestDeletes
      }
    }
  }
  $tests['terminal recovery can clean allowlisted endpoints Redis and environment recorded only in failedResources'] = {
    Set-TestPrepared
    $s.Tags['acme:retirement'] = 'rebuilding'
    $stack = $s.Stacks[$s.Scope.DisposableStack]
    $stack.provisioningState = 'Failed'
    $stack.failedResources = @($stack.resources | ForEach-Object { @{ id = $_.id; error = @{ code = 'DeploymentFailed' } } })
    $stack.resources = @()
    Invoke-TestRetirement 'retire' | Out-Null
    $expectedDeletes = @(
      "delete:app:$($s.Scope.AppNames[0])", "delete:app:$($s.Scope.AppNames[1])",
      'delete:endpoint:kv', 'delete:endpoint:redis', 'delete:redis', 'delete:environment', 'delete:disposable'
    )
    Assert-True ((@($s.Events | Where-Object { $_ -like 'delete:*' }) -join ',') -ceq ($expectedDeletes -join ',')) 'combined records authorize only the allowlisted ordered service deletions'
    foreach ($id in @($s.DisposableIds) + @($s.NicIds)) { Assert-True (-not $s.Resources.ContainsKey($id)) 'failed-only service records are cleaned independently of stack successful resources' }
    Assert-True ($s.Tags['acme:retirement'] -eq 'retired') 'empty successful inventory can recover from terminal failure'
    Assert-TestRetained
  }
  $tests['retire deletes only disposable resources and repeat retirement performs no further deletes'] = {
    Set-TestPrepared
    $before = Get-RetirementProtectedFingerprint $s.Scope
    Invoke-TestRetirement 'retire' | Out-Null
    Assert-True ($s.Tags['acme:retirement'] -eq 'retired') 'successful retirement reaches terminal marker'
    Assert-True ($s.Apps.Count -eq 0 -and -not $s.Stacks.ContainsKey($s.Scope.DisposableStack)) 'apps and disposable stack absent'
    Assert-True ($s.Events.IndexOf('clear:cname') -lt $s.Events.IndexOf("delete:app:$($s.Scope.AppNames[0])")) 'CNAME cleared before apps'
    Assert-True ($s.Events.IndexOf("delete:app:$($s.Scope.AppNames[1])") -lt $s.Events.IndexOf('delete:environment')) 'both apps removed before environment'
    $expectedDeletes = @(
      "delete:app:$($s.Scope.AppNames[0])", "delete:app:$($s.Scope.AppNames[1])",
      'delete:endpoint:kv', 'delete:endpoint:redis', 'delete:redis', 'delete:environment', 'delete:disposable'
    )
    Assert-True ((@($s.Events | Where-Object { $_ -like 'delete:*' }) -join ',') -ceq ($expectedDeletes -join ',')) 'apps, Key Vault endpoint, Redis endpoint, Redis parent, environment, and remaining stack are deleted in order'
    foreach ($id in @($s.DisposableIds) + @($s.NicIds)) { Assert-True (-not $s.Resources.ContainsKey($id)) 'disposable services and NICs released' }
    Assert-TestRetained
    Assert-True ((Get-RetirementProtectedFingerprint $s.Scope) -ceq $before) 'retained identity and secret versions unchanged'
    $s.Events.Clear()
    Invoke-TestRetirement 'retire' | Out-Null
    Assert-NoTestDeletes
    Assert-True ($s.Tags['acme:retirement'] -eq 'retired') 'repeat retirement converges'
  }
  foreach ($kind in @('kv', 'redis')) {
    foreach ($scenario in @('target', 'subnet', 'no-connections', 'multiple-connections', 'unknown-ownership')) {
      $name = "service preflight preserves both endpoints when $kind endpoint fails validation: $scenario"
      $testArguments[$name] = @{ Kind = $kind; Scenario = $scenario }
      $tests[$name] = {
        param($case)
        Set-TestPrepared
        $id = "$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$($case.Kind)-dev-cus-01"
        $properties = $s.Resources[$id].properties
        switch ($case.Scenario) {
          'target' { $properties.privateLinkServiceConnections[0].properties.privateLinkServiceId = $s.Scope.AcsId }
          'subnet' { $properties.subnet.id = $properties.subnet.id.Replace('snet-acme-los-data-dev-cus-01', 'snet-acme-los-app-dev-cus-01') }
          'no-connections' { $properties.privateLinkServiceConnections = @() }
          'multiple-connections' { $properties.privateLinkServiceConnections += Copy-TestObject $properties.privateLinkServiceConnections[0] }
          'unknown-ownership' {
            $s.Tags['acme:retirement'] = 'retiring'
            $stack = $s.Stacks[$s.Scope.DisposableStack]
            $stack.resources = @($stack.resources | Where-Object { $_.id -ne $id })
          }
        }
        $pattern = if ($case.Scenario -eq 'unknown-ownership') { 'Private endpoint is not owned by the disposable stack' } else { 'Private endpoint target or subnet differs' }
        Assert-Fails { Invoke-TestRetirement 'retire' } $pattern
        Assert-True ($s.Apps.Count -eq 0) 'endpoint safety gate is reached after app deletion'
        Assert-True (@($s.Events | Where-Object { $_ -like 'delete:endpoint:*' -or $_ -in @('delete:redis', 'delete:environment', 'delete:disposable') }).Count -eq 0) 'all endpoint and Redis validation precedes the first service deletion'
        foreach ($endpointKind in @('kv', 'redis')) {
          Assert-True ($s.Resources.ContainsKey("$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$endpointKind-dev-cus-01")) 'both endpoints remain allocated, including the valid first endpoint'
        }
        Assert-True ($s.Resources.ContainsKey($s.Scope.RedisId) -and $s.Resources.ContainsKey($s.Scope.EnvironmentId)) 'Redis and environment remain allocated'
        Assert-True ($s.Tags['acme:retirement'] -eq 'retiring') 'failed validation remains visibly incomplete'
        Assert-TestRetained
      }
    }
  }
  $tests['service preflight rejects unowned Redis before deleting either endpoint'] = {
    Set-TestPrepared
    $s.Tags['acme:retirement'] = 'retiring'
    $stack = $s.Stacks[$s.Scope.DisposableStack]
    $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.RedisId })
    Assert-Fails { Invoke-TestRetirement 'retire' } 'Redis is not owned by the disposable stack'
    Assert-True ($s.Apps.Count -eq 0) 'Redis safety gate is reached after app deletion'
    Assert-True (@($s.Events | Where-Object { $_ -like 'delete:endpoint:*' -or $_ -in @('delete:redis', 'delete:environment', 'delete:disposable') }).Count -eq 0) 'Redis ownership is validated before any service deletion'
    Assert-True ($s.Resources.ContainsKey($s.Scope.RedisId) -and $s.Resources.ContainsKey($s.Scope.EnvironmentId)) 'unowned Redis and environment remain allocated'
    Assert-True ($s.Tags['acme:retirement'] -eq 'retiring') 'failed Redis ownership validation preserves retiring marker'
    Assert-TestRetained
  }
  foreach ($scenario in @('infrastructure-group', 'data-subnet', 'vnet', 'subnet-subscription', 'subnet-group', 'missing-infrastructure-group', 'missing-subnet', 'unknown-ownership', 'child-only-ownership')) {
    $name = "environment preflight blocks every service deletion for successful or failed records: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      foreach ($record in @('successful', 'failed')) {
        Reset-TestState
        $s = $global:retirementTest
        Set-TestPrepared
        $s.Tags['acme:retirement'] = 'rebuilding'
        $stack = $s.Stacks[$s.Scope.DisposableStack]
        $stack.provisioningState = 'Failed'
        if ($record -eq 'failed') {
          $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId })
          $stack.failedResources = @(@{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } })
        }
        $properties = $s.Resources[$s.Scope.EnvironmentId].properties
        $pattern = 'Environment networking differs|property .* cannot be found'
        switch ($scenario) {
          'infrastructure-group' { $properties.infrastructureResourceGroup = 'rg-other-cae-infra-dev-cus-01' }
          'data-subnet' { $properties.vnetConfiguration.infrastructureSubnetId = $properties.vnetConfiguration.infrastructureSubnetId.Replace('snet-acme-los-app-dev-cus-01', 'snet-acme-los-data-dev-cus-01') }
          'vnet' { $properties.vnetConfiguration.infrastructureSubnetId = $properties.vnetConfiguration.infrastructureSubnetId.Replace('vnet-acme-los-web-dev-cus-01', 'vnet-other-dev-cus-01') }
          'subnet-subscription' { $properties.vnetConfiguration.infrastructureSubnetId = $properties.vnetConfiguration.infrastructureSubnetId.Replace($s.Scope.Subscription, $s.Scope.PlatformSubscription) }
          'subnet-group' { $properties.vnetConfiguration.infrastructureSubnetId = $properties.vnetConfiguration.infrastructureSubnetId.Replace($s.Scope.Group, 'rg-other-dev-cus-01') }
          'missing-infrastructure-group' { $properties.Remove('infrastructureResourceGroup') }
          'missing-subnet' { $properties.vnetConfiguration.Remove('infrastructureSubnetId') }
          default {
            $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId })
            $stack.failedResources = @()
            if ($scenario -eq 'child-only-ownership') {
              $stack.failedResources = @(@{ id = "$($s.Scope.EnvironmentId)/providers/Microsoft.Insights/diagnosticSettings/diag-acme-los-cae-dev-cus-01"; error = @{ code = 'DeploymentFailed' } })
            }
            $pattern = 'Environment is not recorded by the disposable stack'
          }
        }
        Assert-Fails { Invoke-TestRetirement 'retire' } $pattern
        Assert-True ($s.Apps.Count -eq 0) 'environment safety gate is reached after app deletion'
        Assert-True (@($s.Events | Where-Object { $_ -like 'delete:endpoint:*' -or $_ -in @('delete:redis', 'delete:environment', 'delete:disposable') }).Count -eq 0) 'environment validation completes before the first endpoint or service deletion'
        foreach ($kind in @('kv', 'redis')) {
          Assert-True ($s.Resources.ContainsKey("$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01")) 'valid endpoints survive environment preflight failure'
        }
        Assert-True ($s.Resources.ContainsKey($s.Scope.RedisId) -and $s.Resources.ContainsKey($s.Scope.EnvironmentId)) 'Redis and environment remain allocated'
        Assert-True ($s.Stacks.ContainsKey($s.Scope.DisposableStack) -and $s.Tags['acme:retirement'] -eq 'retiring') 'failed environment validation preserves stack and incomplete marker'
        Assert-TestRetained
      }
    }
  }
  $tests['refreshed failed-resource records cannot introduce arbitrary ownership after app deletion'] = {
    Set-TestPrepared
    $s.Tags['acme:retirement'] = 'rebuilding'
    $stack = $s.Stacks[$s.Scope.DisposableStack]
    $stack.provisioningState = 'Failed'
    $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId })
    $stack.failedResources = @(@{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } })
    $s.Failure = 'stack-failed-ownership-race'
    Assert-Fails { Invoke-TestRetirement 'retire' } 'Unexpected stack resource'
    Assert-True ($s.Apps.Count -eq 0) 'failed-resource ownership changed after both apps were removed'
    Assert-True (@($s.Events | Where-Object { $_ -like 'delete:endpoint:*' -or $_ -in @('delete:redis', 'delete:environment', 'delete:disposable') }).Count -eq 0) 'refreshed failed records must pass the allowlist before service deletion'
    Assert-True ($s.Tags['acme:retirement'] -eq 'retiring') 'failed-record race preserves the recovery marker'
    Assert-TestRetained
  }
  $tests['refreshed stack ownership is checked after app deletion and before service deletion'] = {
    Set-TestPrepared
    $s.Failure = 'stack-ownership-race'
    Assert-Fails { Invoke-TestRetirement 'retire' } 'Unexpected stack resource'
    Assert-True ($s.Apps.Count -eq 0) 'ownership changed only after both apps were removed'
    Assert-True (@($s.Events | Where-Object { $_ -like 'delete:endpoint:*' -or $_ -in @('delete:redis', 'delete:environment', 'delete:disposable') }).Count -eq 0) 'stale preflight ownership cannot authorize service or stack deletion'
    Assert-True ($s.Tags['acme:retirement'] -eq 'retiring') 'refreshed ownership failure preserves retiring marker'
    Assert-TestRetained
  }
  foreach ($missing in @('kv', 'redis', 'both-endpoints', 'all-services')) {
    $name = "interrupted retirement skips absent services even when no longer stack-owned: $missing"
    $testArguments[$name] = $missing
    $tests[$name] = {
      param($missing)
      Set-TestPrepared
      $s.Tags['acme:retirement'] = 'retiring'
      $stack = $s.Stacks[$s.Scope.DisposableStack]
      $stack.provisioningState = 'Failed'
      $absentIds = @()
      foreach ($kind in @('kv', 'redis')) {
        if ($missing -eq $kind -or $missing -in @('both-endpoints', 'all-services')) {
          $id = "$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01"
          $absentIds += @($id, "$id/privateDnsZoneGroups/default", "$($s.Scope.Id)/providers/Microsoft.Network/networkInterfaces/nic-acme-los-$kind-dev-cus-01")
        }
      }
      if ($missing -eq 'all-services') {
        $absentIds += @($s.DisposableIds | Where-Object { $_ -eq $s.Scope.RedisId -or $_.StartsWith("$($s.Scope.RedisId)/") -or $_ -eq $s.Scope.EnvironmentId -or $_.StartsWith("$($s.Scope.EnvironmentId)/") })
      }
      foreach ($id in $absentIds) { $s.Resources.Remove($id) }
      $stack.resources = @($stack.resources | Where-Object { $_.id -notin $absentIds })
      Invoke-TestRetirement 'retire' | Out-Null
      Assert-True ($s.Tags['acme:retirement'] -eq 'retired') 'partial interrupted retirement converges'
      foreach ($kind in @('kv', 'redis')) {
        $expectedCount = if ($missing -eq $kind -or $missing -in @('both-endpoints', 'all-services')) { 0 } else { 1 }
        Assert-True (@($s.Events | Where-Object { $_ -eq "delete:endpoint:$kind" }).Count -eq $expectedCount) 'only still-present endpoints are deleted'
      }
      Assert-True ($s.Events.Contains('delete:redis') -eq ($missing -ne 'all-services')) 'Redis deletion is skipped only when already absent'
      Assert-True ($s.Events.Contains('delete:environment') -eq ($missing -ne 'all-services')) 'environment deletion is skipped only when already absent'
      foreach ($id in @($s.DisposableIds) + @($s.NicIds)) { Assert-True (-not $s.Resources.ContainsKey($id)) 'disposable resources and NICs are absent after retry' }
      Assert-TestRetained
    }
  }
  foreach ($scenario in @('account', 'deploying', 'delegation', 'secret403', 'unknown-resource', 'foreign-app', 'saved-secret-drift', 'saved-identity-drift')) {
    $name = "retirement preflight blocks all mutations: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      Set-TestPrepared
      $pattern = switch ($scenario) {
        'account' { $s.Failure = $scenario; 'Subscription does not match' }
        'deploying' { $s.Failure = $scenario; 'deployment is in progress' }
        'delegation' { $s.Failure = $scenario; 'not delegated' }
        'secret403' { $s.Failure = $scenario; 'Azure DNS request failed' }
        'unknown-resource' { $s.Stacks[$s.Scope.DisposableStack].resources += @{ id = $s.Dns.ZoneId }; 'Unexpected stack resource' }
        'foreign-app' { $app = Copy-TestObject $s.Apps[$s.Scope.AppNames[0]]; $app.name = 'foreign-app'; $s.Apps[$app.name] = $app; 'Another app uses' }
        'saved-secret-drift' { $s.Pages[$s.NextUri].value[1].properties.secretUriWithVersion += '-new'; 'differs from the recovery record' }
        'saved-identity-drift' { $s.Resources[$s.Scope.IdentityId].properties.principalId = '77777777-7777-7777-7777-777777777777'; 'differs from the recovery record' }
      }
      Assert-Fails { Invoke-TestRetirement 'retire' } $pattern
      Assert-True ($s.Events.Count -eq 0) 'preflight failure prevents every mutation'
      Assert-TestRetained
    }
  }
  foreach ($scenario in @('validate-retained', 'validate-disposable', 'create-retained', 'create-disposable', 'retained-ownership')) {
    $name = "prepare failure preserves runtime and supports review or retry: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      $s.Failure = $scenario
      $pattern = if ($scenario -eq 'retained-ownership') { 'ownership changed unexpectedly' } else { 'Azure DNS request failed' }
      Assert-Fails { Invoke-TestRetirement 'prepare' } $pattern
      Assert-NoTestDeletes
      Assert-True ($s.Apps.Count -eq 2 -and $s.Resources.ContainsKey($s.Scope.RedisId)) 'failed preparation preserves runtime'
      if ($scenario.StartsWith('validate-')) { Assert-True (-not $s.Tags.ContainsKey('acme:retirement')) 'failed validation cannot mark preparing' }
      else { Assert-True ($s.Tags['acme:retirement'] -eq 'preparing') 'failed ownership migration remains visibly incomplete' }
      if ($scenario -in @('create-retained', 'create-disposable')) {
        $stackName = if ($scenario -eq 'create-retained') { $s.Scope.RetainedStack } else { $s.Scope.DisposableStack }
        Assert-True ($s.Stacks[$stackName].provisioningState -eq 'Failed') 'failed create persists failed ownership, not a pristine fixture'
        if ($scenario -eq 'create-retained') {
          Assert-True ($s.Stacks[$stackName].parameters.resourcePhase.value -eq 'retained') 'failed migration persisted new retained-phase parameters'
          Assert-True (@($s.Stacks[$stackName].resources | Where-Object { $_.id -eq $s.Scope.EnvironmentId }).Count -eq 1) 'failed retained phase still has mixed old ownership'
        }
        $s.Failure = ''
        Invoke-TestRetirement 'prepare' | Out-Null
        Assert-True ($s.Tags['acme:retirement'] -eq 'active' -and $s.Stacks.Count -eq 2) 'interrupted preparation can be retried'
        Assert-RetirementStack $s.Scope (Copy-TestObject $s.Stacks[$s.Scope.RetainedStack]) 'retained'
        Assert-RetirementStack $s.Scope (Copy-TestObject $s.Stacks[$s.Scope.DisposableStack]) 'disposable'
        Assert-NoTestDeletes
      }
    }
  }
  foreach ($scenario in @('alert-stuck', 'cname-race', 'deployment-race', 'app-delete', 'app-stuck', 'app403', 'kv-endpoint-delete', 'kv-endpoint-stuck', 'redis-endpoint-delete', 'redis-endpoint-stuck', 'redis-delete', 'stack-delete', 'redis-stuck', 'environment-delete', 'environment-stuck', 'managed-network')) {
    $name = "retirement failure preserves retiring marker and retained resources: $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      Set-TestPrepared
      $s.Failure = $scenario
      $pattern = switch ($scenario) {
        'alert-stuck' { 'Alert state did not converge' }
        'deployment-race' { 'deployment is in progress' }
        'app-stuck' { 'Container app deletion did not complete' }
        'kv-endpoint-stuck' { 'Private endpoint deletion did not complete' }
        'redis-endpoint-stuck' { 'Private endpoint deletion did not complete' }
        'redis-stuck' { 'disposable service is still allocated' }
        'environment-stuck' { 'Environment deletion did not complete' }
        'managed-network' { 'has not released the ACA-managed infrastructure' }
        default { 'Azure DNS request failed' }
      }
      Assert-Fails { Invoke-TestRetirement 'retire' } $pattern
      Assert-True ($s.Tags['acme:retirement'] -eq 'retiring') 'failure never claims retirement is complete'
      Assert-TestRetained
      Assert-True (-not $s.Events.Contains('alert:True')) 'failure never re-enables alerts'
      if ($scenario -eq 'app-delete') { Assert-True ($s.Events.Contains("delete:app:$($s.Scope.AppNames[0])")) 'injected app failure was reached' }
      if ($scenario -in @('stack-delete', 'managed-network')) { Assert-True ($s.Events.Contains('delete:disposable')) 'disposable deletion was reached before the injected failure' }
      if ($scenario -match '^(kv|redis)-endpoint-(delete|stuck)$') {
        $kind = $Matches[1]
        Assert-True ($s.Events.Contains("delete:endpoint:$kind")) 'injected endpoint deletion failure was reached'
        Assert-True ($s.Resources.ContainsKey("$($s.Scope.Id)/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$kind-dev-cus-01")) 'failed or stuck endpoint remains allocated'
        Assert-True (-not $s.Events.Contains('delete:redis') -and -not $s.Events.Contains('delete:environment') -and -not $s.Events.Contains('delete:disposable')) 'endpoint failure prevents Redis, environment, and stack deletion'
        if ($kind -eq 'kv') { Assert-True (-not $s.Events.Contains('delete:endpoint:redis')) 'first endpoint failure prevents second endpoint deletion' }
      }
      if ($scenario -in @('redis-delete', 'redis-stuck')) {
        Assert-True ($s.Events.Contains('delete:redis') -and $s.Resources.ContainsKey($s.Scope.RedisId)) 'injected Redis deletion failure was reached and Redis remains allocated'
        Assert-True (-not $s.Events.Contains('delete:environment') -and -not $s.Events.Contains('delete:disposable')) 'Redis failure prevents environment and stack deletion'
      }
      if ($scenario -in @('environment-delete', 'environment-stuck')) {
        Assert-True ($s.Events.Contains('delete:environment') -and $s.Resources.ContainsKey($s.Scope.EnvironmentId)) 'injected environment failure was reached and environment remains allocated'
        Assert-True (-not $s.Resources.ContainsKey($s.Scope.RedisId)) 'Redis was removed before the environment failure'
        Assert-True (-not $s.Events.Contains('delete:disposable')) 'environment failure prevents stack deletion'
      }
      if ($scenario -match 'endpoint-(delete|stuck)$' -or $scenario -in @('redis-delete', 'redis-stuck', 'environment-delete', 'environment-stuck')) {
        Assert-True ($s.Resources.ContainsKey($s.Scope.EnvironmentId) -and $s.Stacks.ContainsKey($s.Scope.DisposableStack)) 'service failures preserve the environment and its owning stack'
      }
      if ($scenario -eq 'alert-stuck') { Assert-NoTestDeletes }
      if ($scenario -in @('cname-race', 'deployment-race', 'app403')) {
        Assert-NoTestDeletes
      }
      if ($scenario -eq 'managed-network') { Assert-True ($s.Sleeps -eq 60) 'managed-network wait is bounded without real sleeping' }
      if ($scenario -match 'endpoint-(delete|stuck)$' -or $scenario -in @('app-delete', 'redis-delete', 'redis-stuck', 'environment-delete', 'environment-stuck', 'stack-delete')) {
        $s.Failure = ''
        $s.Events.Clear()
        Invoke-TestRetirement 'retire' | Out-Null
        Assert-True ($s.Tags['acme:retirement'] -eq 'retired') 'retry converges after partial deletion'
        if ($scenario -in @('environment-delete', 'environment-stuck')) {
          Assert-True ((@($s.Events | Where-Object { $_ -like 'delete:*' }) -join ',') -ceq 'delete:environment,delete:disposable') 'environment retry never repeats app, endpoint, or Redis deletions'
        }
        Assert-TestRetained
      }
    }
  }
  foreach ($scenario in @('environment-delete', 'environment-stuck')) {
    $name = "failed-only environment cleanup preserves evidence and retries after $scenario"
    $testArguments[$name] = $scenario
    $tests[$name] = {
      param($scenario)
      Set-TestPrepared
      $s.Tags['acme:retirement'] = 'rebuilding'
      $s.Apps.Clear()
      $stack = $s.Stacks[$s.Scope.DisposableStack]
      $stack.provisioningState = 'Failed'
      $stack.resources = @($stack.resources | Where-Object { $_.id -ne $s.Scope.EnvironmentId })
      $stack.failedResources = @(@{ id = $s.Scope.EnvironmentId; error = @{ code = 'ManagedEnvironmentCapacityHeavyUsageError' } })
      $s.Failure = $scenario
      $pattern = if ($scenario -eq 'environment-stuck') { 'Environment deletion did not complete' } else { 'Azure DNS request failed' }
      Assert-Fails { Invoke-TestRetirement 'retire' } $pattern
      Assert-True ((@($s.Events | Where-Object { $_ -like 'delete:*' }) -join ',') -ceq 'delete:endpoint:kv,delete:endpoint:redis,delete:redis,delete:environment') 'failed-only environment is explicitly deleted after other disposable services'
      Assert-True ($s.Tags['acme:retirement'] -eq 'retiring' -and $s.Resources.ContainsKey($s.Scope.EnvironmentId)) 'failure preserves incomplete marker and allocated environment'
      Assert-True ($s.Stacks.ContainsKey($s.Scope.DisposableStack) -and $stack.failedResources[0].id -eq $s.Scope.EnvironmentId) 'failed-only ownership evidence survives for retry'
      Assert-TestRetained
      $s.Events.Clear()
      $s.Failure = ''
      Invoke-TestRetirement 'retire' | Out-Null
      Assert-True ((@($s.Events | Where-Object { $_ -like 'delete:*' }) -join ',') -ceq 'delete:environment,delete:disposable') 'retry uses persisted failed ownership without repeating successful deletions'
      Assert-True ($s.Tags['acme:retirement'] -eq 'retired' -and $s.EnvironmentAbsenceConfirmed) 'retry proves failed-only environment absence before completing'
      Assert-TestRetained
      $s.Events.Clear()
      Invoke-TestRetirement 'retire' | Out-Null
      Assert-NoTestDeletes
    }
  }

  $passed = 0
  $failures = [Collections.Generic.List[string]]::new()
  foreach ($test in $tests.GetEnumerator()) {
    Reset-TestState
    $s = $global:retirementTest
    try {
      & $test.Value $testArguments[$test.Key]
      Assert-True ($global:retirementTest.Unexpected.Count -eq 0) 'all CLI commands were explicitly mocked'
      foreach ($path in $global:retirementTest.TemporaryFiles) { Assert-True (-not (Test-Path -LiteralPath $path)) 'temporary request file cleaned up' }
      $passed++
      Write-Host "PASS $($test.Key)"
    } catch {
      $message = "FAIL $($test.Key): $($_.Exception.Message)`n$($_.ScriptStackTrace)"
      $failures.Add($message)
      Write-Host $message
    }
  }
  Write-Host "$passed/$($tests.Count) dev retirement tests passed. All Azure, DNS, HTTP, and sleep boundaries were mocked."
  if ($failures.Count) { throw "$($failures.Count) dev retirement behavioral test(s) failed." }
} finally {
  Remove-Item -LiteralPath $testConfigurationPath -Force -ErrorAction SilentlyContinue
  foreach ($name in $savedFunctions.Keys) {
    if ($savedFunctions[$name]) { Set-Item "Function:global:$name" $savedFunctions[$name] }
    else { Remove-Item "Function:$name" -ErrorAction SilentlyContinue }
  }
  if ($previousState) { Set-Variable retirementTest -Scope Global -Value $previousState.Value }
  else { Remove-Variable retirementTest -Scope Global -ErrorAction SilentlyContinue }
}
