# Runs the real orchestration with an in-memory Azure CLI boundary. No Azure login or network access.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$lifecycleScript = Join-Path $PSScriptRoot '../set-web-environment-state.ps1'
$global:testSub = '11111111-1111-1111-1111-111111111111'
$global:testPlatform = '22222222-2222-2222-2222-222222222222'
$global:testGroup = 'rg-acme-los-web-dev-cus-01'
$global:testScope = "/subscriptions/$testSub/resourceGroups/$testGroup"
$global:testNetwork = "/subscriptions/$testPlatform/resourceGroups/rg-acme-hub-network-cus-01"
$global:testVnet = "$testScope/providers/Microsoft.Network/virtualNetworks/vnet-acme-los-web-dev-cus-01"

function Assert-True($Condition, [string]$Message) {
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Get-Argument([string[]]$Arguments, [string]$Name) {
  $index = [array]::IndexOf($Arguments, $Name)
  if ($index -lt 0) { throw "Missing CLI argument '$Name'." }
  return $Arguments[$index + 1]
}

function Add-TestEndpoint([string]$Role, [string]$Ip) {
  $name = "pep-acme-los-$Role-dev-cus-01"
  $id = "$testScope/providers/Microsoft.Network/privateEndpoints/$name"
  $nic = "$testScope/providers/Microsoft.Network/networkInterfaces/nic-acme-los-$Role-dev-cus-01"
  $targetId = if ($Role -eq 'kv') { $global:testKv } else { $global:testRedis }
  $zone = if ($Role -eq 'kv') { 'privatelink.vaultcore.azure.net' } else { 'privatelink.redis.azure.net' }
  $record = if ($Role -eq 'kv') { 'kvacmelosdevcus01v42c' } else { 'redis-acme-los-dev-cus-01.centralus' }
  $groupId = if ($Role -eq 'kv') { 'vault' } else { 'redisEnterprise' }
  $global:resources[$id] = @{
    id = $id; name = $name; location = 'centralus'; tags = @{ 'acme:environment' = 'dev' }
    properties = @{
      provisioningState = 'Succeeded'; subnet = @{ id = "$testVnet/subnets/snet-acme-los-data-dev-cus-01" }
      customNetworkInterfaceName = "nic-acme-los-$Role-dev-cus-01"; manualPrivateLinkServiceConnections = @(); ipConfigurations = @()
      networkInterfaces = @(@{ id = $nic })
      privateLinkServiceConnections = @(@{ name = "$name-conn"; properties = @{
        privateLinkServiceId = $targetId; groupIds = @($groupId); privateLinkServiceConnectionState = @{ status = 'Approved' }
      } })
    }
  }
  $global:resources["$id/privateDnsZoneGroups"] = @{ value = @(@{
    name = 'default'; properties = @{ provisioningState = 'Succeeded'; privateDnsZoneConfigs = @(@{ properties = @{ privateDnsZoneId = "$testNetwork/providers/Microsoft.Network/privateDnsZones/$zone" } }) }
  }) }
  $global:resources[$nic] = @{ properties = @{ ipConfigurations = @(@{ properties = @{ privateIPAddress = $Ip } }) } }
  $global:resources["$testNetwork/providers/Microsoft.Network/privateDnsZones/$zone/A/$record"] = @{ properties = @{ aRecords = @(@{ ipv4Address = $Ip }) } }
}

function Reset-TestState {
  $global:calls = [Collections.Generic.List[string]]::new()
  $global:resources = @{}
  $global:failure = ''
  $global:marker = 'false'
  $global:testKv = "$testScope/providers/Microsoft.KeyVault/vaults/kvacmelosdevcus01v42c"
  $global:testRedis = "$testScope/providers/Microsoft.Cache/redisEnterprise/redis-acme-los-dev-cus-01"
  $global:apps = @{}
  foreach ($role in @('web', 'bff')) {
    $global:apps["ca-acme-los-$role-dev-cus-01"] = @{ properties = @{
      runningStatus = 'Running'; latestRevisionName = 'revision-1'; latestReadyRevisionName = 'revision-1'
      configuration = @{ ingress = @{ fqdn = 'ca-acme-los-dev.example.centralus.azurecontainerapps.io' } }
    } }
  }
  $global:alerts = @{}
  foreach ($name in @('failed-requests', 'exceptions', 'auth-failures', 'system-errors')) {
    $global:alerts["alrt-acme-los-$name-dev-cus-01"] = $true
  }
  foreach ($id in @($testKv, $testRedis)) {
    $global:resources[$id] = @{ location = 'centralus'; tags = @{ 'acme:environment' = 'dev' }; properties = @{ publicNetworkAccess = 'Disabled' } }
  }
  $global:resources["$testVnet/subnets/snet-acme-los-data-dev-cus-01"] = @{ id = "$testVnet/subnets/snet-acme-los-data-dev-cus-01" }
  foreach ($zone in @('privatelink.vaultcore.azure.net', 'privatelink.redis.azure.net')) {
    $id = "$testNetwork/providers/Microsoft.Network/privateDnsZones/$zone"
    $global:resources[$id] = @{ id = $id }
    $global:resources["$id/virtualNetworkLinks"] = @{ value = @(@{ properties = @{ virtualNetwork = @{ id = $testVnet }; provisioningState = 'Succeeded'; virtualNetworkLinkState = 'Completed' } }) }
  }
  Add-TestEndpoint 'kv' '10.20.0.36'
  Add-TestEndpoint 'redis' '10.20.0.37'
  $global:stack = @{
    provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }
    outputs = @{ workloadVirtualNetworkId = @{ value = $testVnet }; dataSubnetName = @{ value = 'snet-acme-los-data-dev-cus-01' }; keyVaultId = @{ value = $testKv }; redisClusterId = @{ value = $testRedis } }
    resources = @($testKv, $testRedis, "$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01", "$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-redis-dev-cus-01", "$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01/privateDnsZoneGroups/default", "$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-redis-dev-cus-01/privateDnsZoneGroups/default") | ForEach-Object { @{ id = $_ } }
  }
}

function global:az {
  $a = [string[]]@($args | ForEach-Object { $_ })
  $global:LASTEXITCODE = 0
  $verb = $a[0..2] -join ' '
  $result = $null
  switch -Wildcard ($verb) {
    'group show *' { $result = @{ tags = @{ 'acme:hibernated' = $global:marker } } }
    'tag update *' {
      $value = Get-Argument $a '--tags'
      $global:marker = $value.Split('=')[1]
      $global:calls.Add("marker:$global:marker")
    }
    'stack group show' { $result = $global:stack }
    'bicep build *' {
      $result = @{ resources = @(@{ type = 'Microsoft.Network/privateEndpoints' }, @{ type = 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups' }) }
    }
    'deployment group list' {
      $result = @()
      if ($global:failure -eq 'deploying') { $result = @(@{ properties = @{ provisioningState = 'Running' } }) }
    }
    'deployment group validate' {
      if ($global:failure -eq 'validation') { throw 'Validation failed' }
      Assert-True ((Get-Argument $a '--mode') -eq 'Incremental') 'restore must be incremental'
      $parameters = Get-Content -LiteralPath (Get-Argument $a '--parameters').Substring(1) -Raw | ConvertFrom-Json
      $global:calls.Add("validate:$($parameters.parameters.name.value)")
    }
    'deployment group create' {
      if ($global:failure -eq 'restore') { throw 'Restoration failed' }
      Assert-True ((Get-Argument $a '--mode') -eq 'Incremental') 'restore must be incremental'
      $parameters = Get-Content -LiteralPath (Get-Argument $a '--parameters').Substring(1) -Raw | ConvertFrom-Json
      $role = if ($parameters.parameters.name.value -match '-kv-') { 'kv' } else { 'redis' }
      Add-TestEndpoint $role '10.20.0.42'
      $global:calls.Add("create:$role")
      if ($global:failure -eq 'pending') {
        $global:resources["$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-$role-dev-cus-01"].properties.privateLinkServiceConnections[0].properties.privateLinkServiceConnectionState.status = 'Pending'
      }
      if ($global:failure -eq 'dns') {
        $global:resources["$testNetwork/providers/Microsoft.Network/privateDnsZones/privatelink.vaultcore.azure.net/A/kvacmelosdevcus01v42c"].properties.aRecords[0].ipv4Address = '10.20.0.99'
      }
    }
    'containerapp show *' {
      $name = Get-Argument $a '--name'
      if ($global:failure -eq 'app403' -and $name -match '-bff-') { $global:LASTEXITCODE = 1; return 'ERROR: (AuthorizationFailed) Access denied' }
      $result = $global:apps[$name]
    }
    'containerapp revision list' {
      $health = if ($global:failure -eq 'readiness') { 'Unhealthy' } else { 'Healthy' }
      $result = @(@{ properties = @{ active = $true; healthState = $health; runningState = 'Running'; replicas = 2 } })
    }
    'resource show *' {
      if ($global:failure -eq 'alert403') { $global:LASTEXITCODE = 1; return 'ERROR: (AuthorizationFailed) Access denied' }
      if ($global:failure -eq 'alert-missing') { $global:LASTEXITCODE = 1; return 'ERROR: (ResourceNotFound) Alert is absent' }
      $name = (Get-Argument $a '--ids').Split('/')[-1]
      $result = @{ properties = @{ enabled = $global:alerts[$name] } }
    }
    'resource update *' {
      $name = (Get-Argument $a '--ids').Split('/')[-1]
      $enabled = (Get-Argument $a '--set') -eq 'properties.enabled=true'
      if ($global:failure -ne 'alert-stuck') { $global:alerts[$name] = $enabled }
      $global:calls.Add("alert:$enabled")
    }
    'rest --method *' {
      $uri = Get-Argument $a '--uri'
      $id = $uri.Split('?')[0]
      if ((Get-Argument $a '--method') -eq 'get') {
        if ($global:failure -eq 'endpoint403' -and $id -match '/privateEndpoints/') { $global:LASTEXITCODE = 1; return 'ERROR: (AuthorizationFailed) Access denied' }
        if (-not $global:resources.ContainsKey($id)) { $global:LASTEXITCODE = 1; return 'ERROR: Not Found({"error":{"code":"ResourceNotFound","message":"Resource is absent"}})' }
        $result = $global:resources[$id]
      } else {
        $parts = $id.Split('/')
        $name = $parts[-2]
        $action = $parts[-1]
        if ($global:failure -ne 'stop-stuck') { $global:apps[$name].properties.runningStatus = if ($action -eq 'stop') { 'Stopped' } else { 'Running' } }
        $global:calls.Add("${action}:$name")
      }
    }
    'network private-endpoint delete' {
      $id = Get-Argument $a '--ids'
      Assert-True ($id -in @("$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01", "$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-redis-dev-cus-01")) 'only the two dev endpoints can be deleted'
      Assert-True (@($global:apps.Values | Where-Object { $_.properties.runningStatus -ne 'Stopped' }).Count -eq 0) 'apps stopped before endpoint deletion'
      Assert-True (@($global:alerts.Values | Where-Object { $_ }).Count -eq 0) 'alerts disabled before endpoint deletion'
      $global:resources.Remove($id)
      $global:resources.Remove("$id/privateDnsZoneGroups")
      $global:calls.Add("delete:$id")
    }
    default { throw "Unexpected Azure CLI command in offline test: $verb" }
  }
  if ($null -ne $result) { ConvertTo-Json -InputObject $result -Depth 30 -Compress }
}

function global:Start-Sleep { param($Seconds) }
function global:Invoke-WebRequest {
  param([switch]$UseBasicParsing, $Uri, $TimeoutSec, $MaximumRedirection)
  $global:calls.Add('health')
  if ($global:failure -eq 'health') { throw 'HTTP 503' }
  return @{ StatusCode = 200; Content = '{"status":"ok","service":"web-app","layers":{"bff":{"status":"ok"}}}' }
}

function Invoke-TestLifecycle([string]$Action, [hashtable]$Extra = @{}) {
  & $lifecycleScript -EnvironmentName dev -Action $Action -SubscriptionId $testSub -PlatformSubscriptionId $testPlatform @Extra | ConvertFrom-Json
}

function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch {
    Assert-True ($_.Exception.Message -match $Pattern) "expected '$Pattern', got '$($_.Exception.Message)'"
    return
  }
  throw "Expected failure matching '$Pattern'."
}

$tests = [ordered]@{
  'dev pause defaults to full hibernation' = {
    $result = Invoke-TestLifecycle 'pause'
    Assert-True ($result.requestedAction -eq 'pause' -and $result.action -eq 'hibernate') 'records requested and effective actions'
    Assert-True (@($global:calls | Where-Object { $_ -like 'delete:*' }).Count -eq 2) 'default pause removes both endpoints'
    Assert-True ($global:marker -eq 'true') 'default pause blocks ordinary deployment'
  }
  'explicit apps-only pause retains private endpoints' = {
    $result = Invoke-TestLifecycle 'pause-apps'
    Assert-True ($result.action -eq 'pause') 'apps-only pause keeps its existing behavior'
    Assert-True (@($global:calls | Where-Object { $_ -like 'delete:*' }).Count -eq 0) 'no endpoint deletion'
    Assert-True ($global:marker -eq 'false') 'no hibernation marker'
    Assert-True (@($global:apps.Values | Where-Object { $_.properties.runningStatus -ne 'Stopped' }).Count -eq 0) 'both apps stopped'
  }
  'default pause cannot bypass hibernation safety checks' = {
    Assert-Fails { Invoke-TestLifecycle 'pause' @{ WaitForDesiredState = $false } } 'dev-only'
    Assert-Fails { Invoke-TestLifecycle 'pause' @{ SkipAlertSuppression = $true } } 'dev-only'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
  'show-plan is read-only' = {
    $plan = Invoke-TestLifecycle 'show-plan'
    Assert-True ($plan.privateEndpoints.Count -eq 2 -and $plan.privateEndpoints[0].ready) 'reports two ready endpoints'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
  'dev resume cannot bypass health or alert restoration' = {
    Assert-Fails { Invoke-TestLifecycle 'resume' @{ WaitForDesiredState = $false } } 'Dev resume requires'
    Assert-Fails { Invoke-TestLifecycle 'resume' @{ SkipAlertSuppression = $true } } 'Dev resume requires'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
  'missing alerts prevent resume before mutation' = {
    Invoke-TestLifecycle 'hibernate' | Out-Null
    $global:calls.Clear()
    $global:failure = 'alert-missing'
    Assert-Fails { Invoke-TestLifecycle 'resume' } 'All expected dev alerts'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
    Assert-True ($global:marker -eq 'true') 'recovery remains incomplete'
  }
  'failed alert restoration preserves recovery marker' = {
    Invoke-TestLifecycle 'hibernate' | Out-Null
    $global:failure = 'alert-stuck'
    Assert-Fails { Invoke-TestLifecycle 'resume' } 'Alert restoration'
    Assert-True ($global:marker -eq 'true') 'recovery remains incomplete'
    Assert-True (@($global:alerts.Values | Where-Object { $_ }).Count -eq 0) 'alerts still disabled'
  }
  'hibernate retains services and removes exactly two endpoints' = {
    $result = Invoke-TestLifecycle 'hibernate'
    Assert-True (@($global:calls | Where-Object { $_ -like 'delete:*' }).Count -eq 2) 'two deletes'
    Assert-True ($global:resources.ContainsKey($testKv) -and $global:resources.ContainsKey($testRedis)) 'retained services'
    Assert-True ($global:marker -eq 'true') 'blocks ordinary deployment'
    Assert-True (@($result.privateEndpoints | Where-Object exists).Count -eq 0) 'endpoints confirmed absent'
    Assert-True (@($global:calls | Where-Object { $_ -like 'validate:*' }).Count -eq 2) 'both recovery deployments validated'
  }
  'repeated hibernate does not delete again' = {
    Invoke-TestLifecycle 'hibernate' | Out-Null
    $global:calls.Clear()
    Invoke-TestLifecycle 'hibernate' | Out-Null
    Assert-True (@($global:calls | Where-Object { $_ -like 'delete:*' }).Count -eq 0) 'idempotent delete'
  }
  'resume restores both before startup and health precedes alert enable' = {
    Invoke-TestLifecycle 'hibernate' | Out-Null
    $global:calls.Clear()
    Invoke-TestLifecycle 'resume' | Out-Null
    Assert-True ($global:calls.IndexOf('create:redis') -lt $global:calls.IndexOf('start:ca-acme-los-web-dev-cus-01')) 'both endpoints restored before start'
    Assert-True ($global:calls.IndexOf('health') -lt $global:calls.IndexOf('alert:True')) 'health before alerts'
    Assert-True ($global:marker -eq 'false') 'successful recovery unblocks deployment'
  }
  'partial endpoint loss restores only the missing endpoint' = {
    $global:resources.Remove("$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01")
    Invoke-TestLifecycle 'resume' | Out-Null
    Assert-True (@($global:calls | Where-Object { $_ -like 'create:*' }).Count -eq 1) 'only one deployment'
    Assert-True ($global:calls.Contains('create:kv')) 'restore Key Vault endpoint'
  }
  'repeated resume does not recreate healthy endpoints' = {
    Invoke-TestLifecycle 'resume' | Out-Null
    $global:calls.Clear()
    Invoke-TestLifecycle 'resume' | Out-Null
    Assert-True (@($global:calls | Where-Object { $_ -like 'create:*' -or $_ -like 'start:*' }).Count -eq 0) 'idempotent resume'
  }
  'Azure display region is normalized' = {
    $global:resources[$testRedis].location = 'Central US'
    $plan = Invoke-TestLifecycle 'show-plan'
    Assert-True ($plan.privateEndpoints[1].ready) 'display region matches canonical region and DNS name'
  }
  'deployment guard blocks incomplete recovery and permits active environments' = {
    . (Join-Path $PSScriptRoot '../private-connectivity.ps1')
    function Invoke-AzJson { param([string[]]$Arguments) az @Arguments | ConvertFrom-Json }
    $global:marker = 'true'
    Assert-Fails { Assert-WebEnvironmentNotHibernated $testSub $testGroup } 'resume lifecycle command'
    $global:marker = 'false'
    Assert-WebEnvironmentNotHibernated $testSub $testGroup
  }
  'validation failure prevents every mutation' = {
    $global:failure = 'validation'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'Validation failed'
    Assert-True ($global:calls.Count -eq 0) 'no mutations on failed preflight'
  }
  'wrong target prevents deletion' = {
    $global:resources["$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01"].properties.privateLinkServiceConnections[0].properties.privateLinkServiceId = $testRedis
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'service target'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
  'wrong DNS zone prevents deletion' = {
    $global:resources["$testScope/providers/Microsoft.Network/privateEndpoints/pep-acme-los-kv-dev-cus-01/privateDnsZoneGroups"].value[0].properties.privateDnsZoneConfigs[0].properties.privateDnsZoneId = 'another-zone'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'private DNS zone'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
  'public access prevents hibernation' = {
    $global:resources[$testKv].properties.publicNetworkAccess = 'Enabled'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'private-only'
  }
  'missing stack ownership prevents hibernation' = {
    $global:stack.resources = @()
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'does not own'
  }
  'stack deny settings are never bypassed' = {
    $global:stack.denySettings.mode = 'denyDelete'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'deny settings'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
  'in-flight deployment prevents hibernation' = {
    $global:failure = 'deploying'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'deployment is in progress'
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
  'failed stop prevents deletion' = {
    $global:failure = 'stop-stuck'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'Timed out waiting'
    Assert-True (@($global:calls | Where-Object { $_ -like 'delete:*' }).Count -eq 0) 'no deletion'
  }
  'failed alert suppression prevents deletion' = {
    $global:failure = 'alert-stuck'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'Alert suppression'
    Assert-True (@($global:calls | Where-Object { $_ -like 'delete:*' }).Count -eq 0) 'no deletion'
  }
  'hibernate rejects bypass flags and non-dev before calling Azure' = {
    Assert-Fails { Invoke-TestLifecycle 'hibernate' @{ WaitForDesiredState = $false } } 'dev-only'
    Assert-Fails { Invoke-TestLifecycle 'hibernate' @{ SkipAlertSuppression = $true } } 'dev-only'
    foreach ($environment in @('qa', 'stg', 'prod')) {
      Assert-Fails { & $lifecycleScript -EnvironmentName $environment -Action hibernate } 'dev-only'
    }
    Assert-True ($global:calls.Count -eq 0) 'no mutations'
  }
}

$testArguments = @{}
foreach ($scenario in @('app403', 'alert403', 'endpoint403')) {
  $testName = "$scenario does not become resource-not-found"
  $testArguments[$testName] = $scenario
  $tests[$testName] = {
    param([string]$scenario)
    $global:failure = $scenario
    Assert-Fails { Invoke-TestLifecycle 'hibernate' } 'AuthorizationFailed'
    Assert-True ($global:calls.Count -eq 0) 'no mutations on permission failure'
  }
}
foreach ($scenario in @('restore', 'pending', 'dns', 'readiness', 'health')) {
  $testName = "$scenario failure preserves recovery marker and alert suppression"
  $testArguments[$testName] = $scenario
  $tests[$testName] = {
    param([string]$scenario)
    Invoke-TestLifecycle 'hibernate' | Out-Null
    $global:calls.Clear()
    $global:failure = $scenario
    Assert-Fails { Invoke-TestLifecycle 'resume' } 'Restoration failed|not approved|replica readiness|health check'
    Assert-True ($global:marker -eq 'true') 'recovery remains incomplete'
    Assert-True (-not $global:calls.Contains('alert:True')) 'alerts not enabled'
    if ($scenario -in @('restore', 'pending', 'dns')) {
      Assert-True (@($global:calls | Where-Object { $_ -like 'start:*' }).Count -eq 0) 'apps not started'
    }
  }
}

$passed = 0
foreach ($test in $tests.GetEnumerator()) {
  Reset-TestState
  try { & $test.Value $testArguments[$test.Key] } catch { throw "FAIL $($test.Key): $($_.Exception.Message)`n$($_.ScriptStackTrace)" }
  $passed++
  Write-Host "PASS $($test.Key)"
}
Write-Host "$passed lifecycle tests passed. No Azure calls were made."
