Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$activationPath = Join-Path $PSScriptRoot '../activate-web-custom-domain.ps1'
$fixturePath = Join-Path $PSScriptRoot 'offline-activation-configuration.json'

function Assert-True($Value, [string]$Message) {
  if (-not $Value) { throw "Assertion failed: $Message" }
}
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch {
    Assert-True ($_.Exception.Message -match $Pattern) "expected $Pattern, got $($_.Exception.Message)"
    return
  }
  throw "Expected failure: $Pattern"
}
function ConvertTo-FixtureObject($Value) {
  return ConvertTo-Json -InputObject $Value -Depth 30 | ConvertFrom-Json
}
function Get-Argument([string[]]$Arguments, [string]$Name) {
  $index = [array]::IndexOf($Arguments, $Name)
  Assert-True ($index -ge 0 -and $index + 1 -lt $Arguments.Count) "required argument $Name"
  return $Arguments[$index + 1]
}
function Reset-ActivationFixture {
  $subscription = '11111111-1111-1111-1111-111111111111'
  $platformSubscription = '22222222-2222-2222-2222-222222222222'
  $resourceGroup = 'rg-acme-los-web-dev-cus-01'
  $resourceId = "/subscriptions/$subscription/resourceGroups/$resourceGroup"
  $environmentId = "$resourceId/providers/Microsoft.App/managedEnvironments/cae-acme-los-dev-cus-01"
  $zoneId = "/subscriptions/$platformSubscription/resourceGroups/rg-acme-los-dns-cus-01/providers/Microsoft.Network/dnsZones/los.example.test"
  $certificateId = "$environmentId/managedCertificates/mcert-acme-los-dev-apply-dev-los-example-test"
  $identityId = "$resourceId/providers/Microsoft.ManagedIdentity/userAssignedIdentities/identity-test"
  $nameservers = @('ns1.example.test', 'ns2.example.test', 'ns3.example.test', 'ns4.example.test')
  $global:activationFixture = @{
    subscription = $subscription; platformSubscription = $platformSubscription; resourceGroup = $resourceGroup
    hostname = 'apply-dev.los.example.test'; build = 'offline-build-123'; environmentId = $environmentId
    configuration = @{
      organizationShortName = 'acme'; workloadShortName = 'los'; projectName = 'acme-los'
      primaryRegionShortName = 'cus'; primaryLocation = 'centralus'
      subscriptions = @{ nonprodOnline = 'sub-acme-nonprod-online'; platform = 'sub-acme-platform' }
      platformResources = @{ publicDnsResourceGroupName = 'rg-acme-los-dns-cus-01' }
      environments = @{ dev = @{ subscriptionRole = 'nonprod'; publicDomain = @{
        enabled = $true; hostname = 'apply-dev.los.example.test'; managedCertificateValidationMethod = 'CNAME'
        dns = @{ provider = 'azure'; zone = 'los.example.test' }
      } } }
    }
    account = @{ id = $subscription; name = 'sub-acme-nonprod-online' }
    oktaPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../infra/okta/environments/dev.json'))
    okta = @{ web = @{ deployedBaseUrl = 'https://apply-dev.los.example.test'; redirectPath = '/auth/callback'; postLogoutRedirectPath = '/signed-out' } }
    group = @{ id = $resourceId; tags = @{ 'acme:application' = 'acme-los'; 'acme:hibernated' = 'false' } }
    deployments = @(); apps = @{}; records = @{}
    zone = @{ id = $zoneId; tags = @{ acmeApplication = 'acme-los'; acmeLifecycle = 'retain' }
      properties = @{ zoneType = 'Public'; nameServers = $nameservers } }
    publicNs = $nameservers
    zoneUri = "https://management.azure.com${zoneId}?api-version=2018-05-01"
    cnameUri = "https://management.azure.com$zoneId/CNAME/apply-dev?api-version=2018-05-01"
    txtUri = "https://management.azure.com$zoneId/TXT/asuid.apply-dev?api-version=2018-05-01"
    certificateId = $certificateId
    certificateUri = "https://management.azure.com${certificateId}?api-version=2025-01-01"
    certificate = @{ id = $certificateId; properties = @{ subjectName = 'apply-dev.los.example.test'; provisioningState = 'Succeeded' } }
    certificateExists = $false; mutation = ''; failure = ''; sleeps = 0; healthMismatch = ''; action = ''
    calls = [Collections.Generic.List[string]]::new()
    writes = [Collections.Generic.List[string]]::new()
    events = [Collections.Generic.List[string]]::new()
    violations = [Collections.Generic.List[string]]::new()
    temporaryFiles = [Collections.Generic.List[string]]::new()
  }
  foreach ($kind in @('web', 'bff')) {
    $name = "ca-acme-los-$kind-dev-cus-01"
    $global:activationFixture.apps[$kind] = ConvertTo-FixtureObject @{
      id = "$resourceId/providers/Microsoft.App/containerApps/$name"; name = $name
      identity = @{ type = 'UserAssigned'; userAssignedIdentities = @{ $identityId = @{ principalId = 'synthetic-principal' } } }
      properties = @{
        environmentId = $environmentId; runningStatus = 'Running'; provisioningState = 'Succeeded'
        customDomainVerificationId = ('A' * 64)
        configuration = @{
          activeRevisionsMode = 'Single'
          ingress = @{ external = ($kind -eq 'web'); targetPort = 3000; transport = 'auto'
            fqdn = "$name.new-env.centralus.azurecontainerapps.io"; customDomains = @()
            traffic = @(@{ latestRevision = $true; weight = 100 }) }
          registries = @(@{ server = 'registry.example.test'; identity = $identityId })
          secrets = @(@{ name = 'session-secret'; keyVaultUrl = 'https://vault.example.test/secrets/session'; identity = $identityId })
        }
        template = @{
          containers = @(@{ name = $kind; image = "registry.example.test/${kind}:immutable-test"
            resources = @{ cpu = 0.5; memory = '1Gi' }
            env = @(@{ name = 'APP_BUILD_ID'; value = 'offline-build-123' },
              @{ name = 'CONFIG_SETTING'; value = 'preserve-me' }, @{ name = 'SESSION_SECRET'; secretRef = 'session-secret' },
              @{ name = 'ACME_OKTA_REDIRECT_URI'; value = 'https://previous.example.test/auth/callback' },
              @{ name = 'ACME_OKTA_POST_LOGOUT_REDIRECT_URI'; value = 'https://previous.example.test/signed-out' }) })
          scale = @{ minReplicas = 1; maxReplicas = 2 }
        }
      }
    }
  }
}

# Feed a synthetic configuration to both real scripts without editing repository configuration.
function Get-Content {
  param([string]$LiteralPath, [switch]$Raw)
  if ([IO.Path]::GetFullPath($LiteralPath) -ceq $global:activationFixture.oktaPath) {
    return $global:activationFixture.okta | ConvertTo-Json -Depth 6
  }
  Assert-True ($LiteralPath -ceq $fixturePath -and $Raw) 'only the synthetic configuration is read'
  return $global:activationFixture.configuration | ConvertTo-Json -Depth 12
}
function Set-FixtureBinding([string]$Type = 'SniEnabled') {
  $global:activationFixture.apps.web.properties.configuration.ingress.customDomains = @(
    ConvertTo-FixtureObject @{ name = $global:activationFixture.hostname; bindingType = $Type; certificateId = $global:activationFixture.certificateId }
  )
}
function Invoke-FixtureMutation {
  $f = $global:activationFixture
  if (-not $f.mutation) { return }
  $kind, $field = $f.mutation -split '/'
  $app = $f.apps[$kind]
  switch ($field) {
    'image' { $app.properties.template.containers[0].image = 'registry.example.test/changed:unexpected' }
    'config' { $app.properties.template.containers[0].env[1].value = 'changed' }
    'secretref' { $app.properties.template.containers[0].env[2].secretRef = 'different-secret' }
    'empty-secret-value' { $app.properties.template.containers[0].env[2] | Add-Member -NotePropertyName value -NotePropertyValue '' -Force }
    'literal-secret-value' { $app.properties.template.containers[0].env[2] | Add-Member -NotePropertyName value -NotePropertyValue 'synthetic-not-a-secret' -Force }
    'keyvault' { $app.properties.configuration.secrets[0].keyVaultUrl = 'https://vault.example.test/secrets/different' }
    'identity' { $app.identity.type = 'SystemAssigned' }
    'ingress' { $app.properties.configuration.ingress.targetPort = 8080 }
    'scale' { $app.properties.template.scale.maxReplicas = 10 }
    'callback' { $app.properties.template.containers[0].env[3].value = 'https://unexpected.example.test/callback' }
    'hostname' { $app.properties.configuration.ingress.customDomains[0].bindingType = 'Disabled' }
    default { throw "Unknown mutation $field" }
  }
}
function Invoke-FixtureAz([string[]]$Arguments) {
  $f = $global:activationFixture
  $command = $Arguments -join ' '
  if ($Arguments[0] -ne 'rest') {
    Assert-True ((Get-Argument $Arguments '--subscription') -ceq $f.subscription) 'workload subscription is explicit'
  }
  if ($command.StartsWith('account show ')) { return $f.account }
  if ($command.StartsWith('group show ')) {
    Assert-True ((Get-Argument $Arguments '--name') -ceq $f.resourceGroup) 'expected workload group'
    return $f.group
  }
  if ($command.StartsWith('deployment group ') -or $command.StartsWith('containerapp ')) {
    Assert-True ((Get-Argument $Arguments '--resource-group') -ceq $f.resourceGroup) 'writes and reads stay in workload group'
  }
  if ($command.StartsWith('deployment group list ')) { return ,$f.deployments }
  if ($command.StartsWith('containerapp revision list ')) {
    $name = Get-Argument $Arguments '--name'
    $kind = if ($name -ceq $f.apps.web.name) { 'web' } elseif ($name -ceq $f.apps.bff.name) { 'bff' } else { throw 'Unexpected app readiness target' }
    $f.events.Add("ready:$kind")
    return @(@{ properties = @{ active = $true; healthState = $(if ($f.failure -eq 'origin-readiness') { 'None' } else { 'Healthy' }); runningState = 'Running'; replicas = 2 } })
  }
  if ($command.StartsWith('containerapp show ')) {
    $name = Get-Argument $Arguments '--name'
    foreach ($app in $f.apps.Values) { if ($app.name -ceq $name) { return $app } }
    throw 'Unexpected container app read'
  }
  if ($command.StartsWith('containerapp update ')) {
    Assert-True ($f.action -ceq 'sync-auth-origin') 'runtime updates forbidden during hostname activation'
    $name = Get-Argument $Arguments '--name'
    $kind = if ($name -ceq $f.apps.bff.name) { 'bff' } elseif ($name -ceq $f.apps.web.name) { 'web' } else { throw 'Unexpected app update' }
    $app = $f.apps[$kind]
    $first = [array]::IndexOf($Arguments, '--set-env-vars')
    $last = [array]::IndexOf($Arguments, '--output')
    Assert-True ($first -gt 0 -and $last -gt $first + 1) 'origin update must use set-env-vars'
    $changes = @($Arguments[($first + 1)..($last - 1)])
    $expected = @('containerapp', 'update', '--subscription', $f.subscription, '--resource-group', $f.resourceGroup,
      '--name', $name, '--container-name', $app.properties.template.containers[0].name, '--set-env-vars') +
      $changes + @('--output', 'json', '--only-show-errors')
    Assert-True (($Arguments -join '|') -ceq ($expected -join '|')) 'no image, secret, identity, scale, or other update options'
    $allowed = @{
      ACME_OKTA_REDIRECT_URI = "$($f.okta.web.deployedBaseUrl)$($f.okta.web.redirectPath)"
      ACME_OKTA_POST_LOGOUT_REDIRECT_URI = "$($f.okta.web.deployedBaseUrl)$($f.okta.web.postLogoutRedirectPath)"
    }
    Assert-True ($changes.Count -in @(1, 2)) 'at most two public callback settings'
    foreach ($change in $changes) {
      $key, $value = $change -split '=', 2
      Assert-True ($allowed.ContainsKey($key) -and $value -ceq $allowed[$key]) 'only exact manifest callback keys and values'
      $entry = @($app.properties.template.containers[0].env | Where-Object { $_.name -ceq $key })
      Assert-True ($entry.Count -eq 1) 'unique callback setting'
      if ($f.failure -ne 'origin-readback') { $entry[0].value = $value }
    }
    $f.writes.Add("origin:$kind"); $f.events.Add("origin:$kind")
    if ($f.mutation.StartsWith("$kind/")) { Invoke-FixtureMutation }
    return $app
  }
  if ($command.StartsWith('containerapp hostname add ') -or $command.StartsWith('containerapp hostname bind ')) {
    Assert-True ((Get-Argument $Arguments '--name') -ceq $f.apps.web.name) 'only web hostname can change'
    Assert-True ((Get-Argument $Arguments '--hostname') -ceq $f.hostname) 'only configured hostname can change'
    Assert-True ($f.events.Contains('dns:verified')) 'DNS verified before hostname mutation'
    if ($Arguments[2] -eq 'add') {
      $f.writes.Add('register'); $f.events.Add('register')
      Set-FixtureBinding 'Disabled'
    } else {
      Assert-True ((Get-Argument $Arguments '--certificate') -ceq $f.certificateId) 'source-owned certificate only'
      Assert-True ($f.events.Contains('certificate:ready')) 'certificate ready before bind'
      $f.writes.Add('bind'); $f.events.Add('bind')
      if ($f.failure -ne 'binding-readback') { Set-FixtureBinding }
      Invoke-FixtureMutation
    }
    return @{}
  }
  if ($command.StartsWith('deployment group create ')) {
    $template = Get-Argument $Arguments '--template-file'
    Assert-True ([IO.Path]::GetFileName($template) -ceq 'main.web.certificate.rg.bicep') 'no runtime or stack deployment'
    Assert-True ((Get-Argument $Arguments '--name') -ceq 'certificate-dev') 'certificate-only deployment'
    $parameterIndex = [array]::IndexOf($Arguments, '--parameters')
    $outputIndex = [array]::IndexOf($Arguments, '--output')
    $parameters = @($Arguments[($parameterIndex + 1)..($outputIndex - 1)] | Sort-Object)
    $expected = @('environmentName=dev', 'location=centralus', 'managedEnvironmentName=cae-acme-los-dev-cus-01',
      "hostname=$($f.hostname)", 'organizationShortName=acme', 'workloadShortName=los') | Sort-Object
    Assert-True (($parameters -join ',') -ceq ($expected -join ',')) 'certificate deployment has only expected parameters'
    $registered = @($f.apps.web.properties.configuration.ingress.customDomains | Where-Object {
      $_.name -ceq $f.hostname -and $_.bindingType -ceq 'Disabled'
    })
    Assert-True ($registered.Count -eq 1) 'hostname registered in this run or a previous attempt before certificate issuance'
    Assert-True ($f.events.Contains('dns:verified')) 'DNS verified before certificate issuance'
    $f.writes.Add('certificate'); $f.events.Add('certificate:create'); $f.certificateExists = $true
    return @{}
  }
  if ($Arguments[0] -eq 'rest') {
    $uri = Get-Argument $Arguments '--uri'
    $method = Get-Argument $Arguments '--method'
    if ($uri -ceq $f.zoneUri -and $method -ceq 'get') { return $f.zone }
    if ($uri -ceq $f.certificateUri -and $method -ceq 'get') {
      Assert-True $f.certificateExists 'certificate is issued or already exists'
      $f.events.Add($(if ($f.certificate.properties.provisioningState -eq 'Succeeded') { 'certificate:ready' } else { 'certificate:pending' }))
      return $f.certificate
    }
    Assert-True ($uri -cin @($f.cnameUri, $f.txtUri)) 'only the two app records may be accessed'
    if ($method -ceq 'get') {
      if ($f.records.ContainsKey($uri)) { return $f.records[$uri] }
      $global:LASTEXITCODE = 3
      return @{ error = @{ code = 'ResourceNotFound' } }
    }
    Assert-True ($method -ceq 'put') 'no ARM delete, patch, or whole-zone write'
    $bodyPath = (Get-Argument $Arguments '--body').Substring(1)
    $headersPath = (Get-Argument $Arguments '--headers').Substring(1)
    $f.temporaryFiles.Add($bodyPath); $f.temporaryFiles.Add($headersPath)
    $body = Microsoft.PowerShell.Management\Get-Content -Raw -LiteralPath $bodyPath | ConvertFrom-Json
    $headers = Microsoft.PowerShell.Management\Get-Content -Raw -LiteralPath $headersPath | ConvertFrom-Json
    Assert-True ($headers.'If-None-Match' -ceq '*') 'fresh DNS records use conditional creation'
    Assert-True ($body.properties.metadata.'acme-owner' -ceq 'acme-los-dev-web') 'DNS ownership retained'
    if ($uri -ceq $f.cnameUri) {
      Assert-True ($body.properties.CNAMERecord.cname -ceq $f.apps.web.properties.configuration.ingress.fqdn) 'CNAME comes from observed app'
      $stage = 'dns:cname'
    } else {
      Assert-True (($body.properties.TXTRecords[0].value -join '') -ceq ('A' * 64)) 'TXT comes from observed verification ID'
      $stage = 'dns:txt'
    }
    $body | Add-Member -NotePropertyName etag -NotePropertyValue '"offline-etag"'
    $f.records[$uri] = $body
    $f.writes.Add($stage); $f.events.Add($stage)
    return $body
  }
  throw "Forbidden or unexpected Azure command: $command"
}
function az {
  $global:activationFixture.calls.Add(($args -join ' '))
  $global:LASTEXITCODE = 0
  try {
    $result = Invoke-FixtureAz -Arguments $args
    return ConvertTo-Json -InputObject $result -Depth 30 -Compress
  } catch {
    $global:activationFixture.violations.Add($_.Exception.Message)
    $global:LASTEXITCODE = 1
    throw
  }
}
function node {
  $f = $global:activationFixture
  $global:LASTEXITCODE = 0
  try {
    Assert-True ([IO.Path]::GetFileName($args[0]) -ceq 'verify-public-dns.mjs') 'only DNS verifier may run'
    if ($args.Count -eq 3 -and $args[1] -ceq 'zone' -and $args[2] -ceq 'los.example.test') {
      return @{ zone = 'los.example.test'; nameServers = $f.publicNs } | ConvertTo-Json -Compress
    }
    Assert-True ($args.Count -eq 4 -and $args[1] -ceq $f.hostname -and
      $args[2] -ceq $f.apps.web.properties.configuration.ingress.fqdn -and $args[3] -ceq ('A' * 64)) 'DNS verification uses observed app values'
    Assert-True ($f.records.Count -eq 2) 'both records exist before public verification'
    if ($f.failure -eq 'dns') { $global:LASTEXITCODE = 1; return 'Synthetic DNS failure' }
    $f.events.Add('dns:verified')
    return '{}'
  } catch {
    $f.violations.Add($_.Exception.Message)
    $global:LASTEXITCODE = 1
    throw
  }
}
function Invoke-WebRequest {
  param([switch]$UseBasicParsing, [string]$Uri, [int]$TimeoutSec, [int]$MaximumRedirection, [string]$ErrorAction)
  $f = $global:activationFixture
  try {
    Assert-True ($UseBasicParsing -and $TimeoutSec -eq 20 -and $MaximumRedirection -eq 0 -and $ErrorAction -eq 'Stop') 'HTTPS probe preserves TLS and rejects redirects'
    $generated = "https://$($f.apps.web.properties.configuration.ingress.fqdn)/api/health"
    Assert-True ($Uri -cin @($generated, "https://$($f.hostname)/api/health")) 'only expected health endpoints'
    $stage = if ($Uri -ceq $generated) { 'health:generated' } else { 'health:stable' }
    $f.events.Add($stage)
    $health = @{ status = 'ok'; service = 'web-app'; environment = 'dev'; build = $f.build
      layers = @{ bff = @{ status = 'ok'; build = $f.build } } }
    if ($f.healthMismatch -ceq $stage) { $health.layers.bff.build = 'wrong-build' }
    return [pscustomobject]@{ StatusCode = 200; Content = ($health | ConvertTo-Json -Depth 6) }
  } catch { $f.violations.Add($_.Exception.Message); throw }
}
function Start-Sleep { param([int]$Seconds) $global:activationFixture.sleeps++ }
function Invoke-Activation([string]$Action = 'apply', [string]$ConfirmHostname = $global:activationFixture.hostname) {
  $global:activationFixture.action = $Action
  & $activationPath -EnvironmentName dev -Action $Action -SubscriptionId $global:activationFixture.subscription `
    -PlatformSubscriptionId $global:activationFixture.platformSubscription -ConfigurationPath $fixturePath -ConfirmHostname $ConfirmHostname
}
function Assert-NoWrites {
  Assert-True ($global:activationFixture.writes.Count -eq 0) 'rejection or plan performs zero writes'
}
function Assert-MockSafety {
  Assert-True ($global:activationFixture.violations.Count -eq 0) "all external calls allowlisted: $($global:activationFixture.violations -join '; ')"
  Assert-True (@($global:activationFixture.calls | Where-Object {
    $_ -match '^(acr |bicep |stack |keyvault |containerapp secret |containerapp revision (?!list )|deployment sub )' -or
    ($global:activationFixture.action -ne 'sync-auth-origin' -and $_ -match '^containerapp update ')
  }).Count -eq 0) 'zero build, stack, Key Vault, runtime, or secret writes'
  foreach ($path in $global:activationFixture.temporaryFiles) {
    Assert-True (-not (Test-Path -LiteralPath $path)) 'DNS payload files cleaned up'
  }
}

$tests = [ordered]@{
  'show-plan reads observed app state without DNS, hostname, certificate, or health writes' = {
    $plan = Invoke-Activation -Action show-plan | ConvertFrom-Json
    Assert-True ($plan.action -eq 'show-plan' -and $plan.initialPhase -eq 'none') 'read-only activation plan'
    Assert-True ($plan.hostname -ceq $global:activationFixture.hostname -and $plan.build -ceq $global:activationFixture.build) 'observed hostname and build'
    Assert-True ($plan.webImage -ceq $global:activationFixture.apps.web.properties.template.containers[0].image -and
      $plan.bffImage -ceq $global:activationFixture.apps.bff.properties.template.containers[0].image) 'current image identities'
    Assert-True ($plan.certificateId -ceq $global:activationFixture.certificateId) 'expected certificate resource'
    Assert-True ($global:activationFixture.calls.Count -gt 0 -and $global:activationFixture.events.Count -eq 0) 'read-only Azure inspection without activation stages'
    Assert-NoWrites
  }
  'missing, wrong, and case-mismatched hostname confirmation reject before any Azure call' = {
    foreach ($confirmation in @('', 'wrong.los.example.test', 'APPLY-DEV.los.example.test')) {
      Reset-ActivationFixture
      Assert-Fails { Invoke-Activation -ConfirmHostname $confirmation } 'ConfirmHostname must exactly match'
      Assert-True ($global:activationFixture.calls.Count -eq 0) 'confirmation checked before Azure access'
      Assert-NoWrites; Assert-MockSafety
    }
  }
  'disabled public domain rejects before Azure access' = {
    $global:activationFixture.configuration.environments.dev.publicDomain.enabled = $false
    Assert-Fails { Invoke-Activation } 'enabled dev publicDomain'
    Assert-True ($global:activationFixture.calls.Count -eq 0) 'source opt-in required'
    Assert-NoWrites
  }
  'wrong workload subscription rejects before writes' = {
    $global:activationFixture.account.name = 'sub-unrelated'
    Assert-Fails { Invoke-Activation } 'Unexpected workload subscription'
    Assert-True ($global:activationFixture.calls.Count -eq 1) 'no resource access in wrong subscription'
    Assert-NoWrites
  }
  'unowned workload rejects before writes' = {
    $global:activationFixture.group.tags.'acme:application' = 'other-project'
    Assert-Fails { Invoke-Activation } 'Unexpected workload ownership'
    Assert-NoWrites
  }
  'hibernated workload rejects before DNS or app mutation' = {
    $global:activationFixture.group.tags.'acme:hibernated' = 'true'
    Assert-Fails { Invoke-Activation } 'Resume the workload'
    Assert-True ($global:activationFixture.calls.Count -eq 2) 'hibernation guard precedes app and DNS access'
    Assert-NoWrites
  }
  'every in-flight deployment state rejects before writes' = {
    foreach ($state in @('Accepted', 'Running', 'Creating', 'Updating')) {
      Reset-ActivationFixture
      $global:activationFixture.deployments = @(@{ properties = @{ provisioningState = 'Succeeded' } }, @{ properties = @{ provisioningState = $state } })
      Assert-Fails { Invoke-Activation } 'deployment is in progress'
      Assert-NoWrites; Assert-MockSafety
    }
  }
  'stopped or unprovisioned web and BFF each reject before writes' = {
    foreach ($kind in @('web', 'bff')) {
      foreach ($property in @('runningStatus', 'provisioningState')) {
        Reset-ActivationFixture
        $global:activationFixture.apps[$kind].properties.$property = $(if ($property -eq 'runningStatus') { 'Stopped' } else { 'Updating' })
        Assert-Fails { Invoke-Activation } 'Both existing apps must be running and provisioned'
        Assert-NoWrites; Assert-MockSafety
      }
    }
  }
  'incorrect web or BFF ingress exposure rejects before writes' = {
    foreach ($kind in @('web', 'bff')) {
      Reset-ActivationFixture
      $global:activationFixture.apps[$kind].properties.configuration.ingress.external = ($kind -eq 'bff')
      Assert-Fails { Invoke-Activation } 'Expected public web ingress and private BFF ingress'
      Assert-NoWrites; Assert-MockSafety
    }
  }
  'mismatched app builds reject before writes' = {
    $global:activationFixture.apps.bff.properties.template.containers[0].env[0].value = 'different-build'
    Assert-Fails { Invoke-Activation } 'must already run the same build'
    Assert-NoWrites
  }
  'unmanaged hostnames and certificate bindings reject before writes' = {
    foreach ($conflict in @('hostname', 'certificate', 'duplicate')) {
      Reset-ActivationFixture
      Set-FixtureBinding
      $domains = $global:activationFixture.apps.web.properties.configuration.ingress.customDomains
      switch ($conflict) {
        'hostname' { $domains[0].name = 'unmanaged.los.example.test' }
        'certificate' { $domains[0].certificateId = '/unmanaged-certificate' }
        'duplicate' { $global:activationFixture.apps.web.properties.configuration.ingress.customDomains += $domains[0] }
      }
      Assert-Fails { Invoke-Activation } 'Unmanaged custom domains|unmanaged certificate'
      Assert-NoWrites; Assert-MockSafety
    }
  }
  'wrong retained zone or public delegation rejects before writes' = {
    foreach ($conflict in @('zone', 'delegation')) {
      Reset-ActivationFixture
      if ($conflict -eq 'zone') { $global:activationFixture.zone.tags.acmeLifecycle = 'delete' }
      else { $global:activationFixture.publicNs = @('unrelated.example.test') }
      Assert-Fails { Invoke-Activation } 'does not match the retained|not delegated'
      Assert-NoWrites; Assert-MockSafety
    }
  }
  'successful activation orders DNS, registration, certificate, binding, preservation, and HTTPS' = {
    $global:activationFixture.deployments = @(@{ properties = @{ provisioningState = 'Succeeded' } })
    $result = Invoke-Activation | ConvertFrom-Json
    Assert-True ($result.status -eq 'https-verified' -and $result.runtimePreserved -eq $true -and
      $result.hostname -ceq $global:activationFixture.hostname -and $result.build -ceq $global:activationFixture.build) 'verified success result'
    Assert-True (($global:activationFixture.events -join ',') -ceq
      'health:generated,dns:cname,dns:txt,dns:verified,register,certificate:create,certificate:ready,bind,health:stable') 'exact activation order'
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'dns:cname,dns:txt,register,certificate,bind') 'only five intended writes'
  }
  'partially registered Disabled hostname skips add and resumes certificate issuance and binding' = {
    Set-FixtureBinding 'Disabled'
    $global:activationFixture.apps.web.properties.configuration.ingress.customDomains[0].PSObject.Properties.Remove('certificateId')
    $result = Invoke-Activation | ConvertFrom-Json
    Assert-True ($result.status -eq 'https-verified' -and $result.runtimePreserved -eq $true) 'partial activation recovers successfully'
    Assert-True (@($global:activationFixture.calls | Where-Object { $_ -match '^containerapp hostname add ' }).Count -eq 0) 'existing Disabled registration is never added again'
    Assert-True (($global:activationFixture.events -join ',') -ceq
      'health:generated,dns:cname,dns:txt,dns:verified,certificate:create,certificate:ready,bind,health:stable') 'retry resumes at certificate issuance after DNS verification'
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'dns:cname,dns:txt,certificate,bind') 'only DNS, certificate, and binding writes on retry'
    $binding = $global:activationFixture.apps.web.properties.configuration.ingress.customDomains[0]
    Assert-True ($binding.bindingType -ceq 'SniEnabled' -and $binding.certificateId -ceq $global:activationFixture.certificateId) 'expected HTTPS binding persisted'
  }
  'already-bound activation and a repeat run never mutate hostname or certificate' = {
    Set-FixtureBinding
    $global:activationFixture.certificateExists = $true
    $before = $global:activationFixture.apps | ConvertTo-Json -Depth 30 -Compress
    Invoke-Activation | Out-Null
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'dns:cname,dns:txt') 'existing HTTPS binding never downgraded'
    $global:activationFixture.writes.Clear(); $global:activationFixture.events.Clear()
    $result = Invoke-Activation | ConvertFrom-Json
    Assert-True ($result.status -eq 'https-verified') 'repeat succeeds'
    Assert-NoWrites
    Assert-True (($global:activationFixture.events -join ',') -ceq 'health:generated,dns:verified,certificate:ready,health:stable') 'only verification on repeat'
    Assert-True (($global:activationFixture.apps | ConvertTo-Json -Depth 30 -Compress) -ceq $before) 'both apps unchanged'
  }
  'baseline health build mismatch prevents all writes' = {
    $global:activationFixture.healthMismatch = 'health:generated'
    Assert-Fails { Invoke-Activation } 'HTTPS health or build verification failed'
    Assert-True ($global:activationFixture.events.Count -eq 3 -and $global:activationFixture.sleeps -eq 2) 'bounded baseline retries without sleeping'
    Assert-NoWrites
  }
  'failed public DNS verification prevents registration and certificate issuance' = {
    $global:activationFixture.failure = 'dns'
    Assert-Fails { Invoke-Activation } 'Public DNS.*did not verify'
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'dns:cname,dns:txt') 'no downstream writes or automatic rollback'
    Assert-True ($global:activationFixture.sleeps -eq 29) 'bounded DNS retry budget'
  }
  'managed certificate identity mismatches prevent binding' = {
    foreach ($field in @('id', 'subjectName')) {
      Reset-ActivationFixture
      if ($field -eq 'id') { $global:activationFixture.certificate.id = '/wrong-certificate' }
      else { $global:activationFixture.certificate.properties.subjectName = 'wrong.los.example.test' }
      Assert-Fails { Invoke-Activation } 'certificate identity does not match'
      Assert-True (($global:activationFixture.writes -join ',') -ceq 'dns:cname,dns:txt,register,certificate') 'certificate mismatch stops before bind'
      Assert-True (-not $global:activationFixture.events.Contains('health:stable')) 'no success probe'
      Assert-MockSafety
    }
  }
  'failed or indefinitely pending certificate never binds' = {
    foreach ($state in @('Failed', 'Pending')) {
      Reset-ActivationFixture
      $global:activationFixture.certificate.properties.provisioningState = $state
      Assert-Fails { Invoke-Activation } 'issuance did not succeed|issuance is still pending'
      Assert-True (-not $global:activationFixture.writes.Contains('bind')) 'no binding before issuance'
      Assert-True ($global:activationFixture.sleeps -eq $(if ($state -eq 'Pending') { 59 } else { 0 })) 'bounded certificate polling'
      Assert-MockSafety
    }
  }
  'binding readback must persist before HTTPS success' = {
    $global:activationFixture.failure = 'binding-readback'
    Assert-Fails { Invoke-Activation } 'HTTPS binding did not persist'
    Assert-True (-not $global:activationFixture.events.Contains('health:stable')) 'no HTTPS verification after absent binding'
  }
  'preservation snapshots detect image, config, secret references, identity, ingress, and scale changes in either app' = {
    foreach ($kind in @('web', 'bff')) {
      foreach ($field in @('image', 'config', 'secretref', 'keyvault', 'identity', 'ingress', 'scale', 'callback')) {
        Reset-ActivationFixture
        $global:activationFixture.mutation = "$kind/$field"
        Assert-Fails { Invoke-Activation } 'Unexpected app configuration change detected.*no automatic rollback'
        Assert-True ($global:activationFixture.events.Contains('bind')) "mutation injected after binding: $kind/$field"
        Assert-True (-not $global:activationFixture.events.Contains('health:stable')) "preservation checked before HTTPS success: $kind/$field"
        Assert-True ($global:activationFixture.writes.Count -eq 5) 'no rollback or extra writes on mutation'
        Assert-MockSafety
      }
    }
  }
  'stable-host health mismatch cannot report successful recovery' = {
    $global:activationFixture.healthMismatch = 'health:stable'
    Assert-Fails { Invoke-Activation } 'HTTPS health or build verification failed'
    Assert-True ($global:activationFixture.writes.Count -eq 5 -and $global:activationFixture.sleeps -eq 29) 'final health retries without rollback'
  }
  'auth origin requires exact hostname confirmation and existing TLS binding' = {
    Assert-Fails { Invoke-Activation -Action sync-auth-origin -ConfirmHostname 'wrong.example.test' } 'ConfirmHostname must exactly match'
    Assert-True ($global:activationFixture.calls.Count -eq 0) 'confirmation before Azure access'
    Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'Activate HTTPS before migrating auth origins'
    Assert-NoWrites
  }
  'auth origin rejects a wrong or case-mismatched manifest before updates' = {
    foreach ($origin in @('https://wrong.example.test', 'http://apply-dev.los.example.test', 'https://APPLY-DEV.los.example.test', 'https://apply-dev.los.example.test/')) {
      Reset-ActivationFixture
      Set-FixtureBinding
      $global:activationFixture.okta.web.deployedBaseUrl = $origin
      Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'Okta manifest must use the activated HTTPS origin'
      Assert-NoWrites; Assert-MockSafety
    }
  }
  'auth origin updates only two callback keys on BFF then web and is idempotent' = {
    Set-FixtureBinding
    $result = Invoke-Activation -Action sync-auth-origin | ConvertFrom-Json
    Assert-True ($result.status -eq 'auth-origin-configured' -and $result.build -ceq $global:activationFixture.build) 'verified origin migration'
    Assert-True (($global:activationFixture.events -join ',') -ceq
      'health:generated,health:stable,origin:bff,ready:bff,origin:web,ready:web,health:stable') 'BFF then web, bounded by ready revisions and healthy TLS probes'
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'origin:bff,origin:web') 'no DNS, hostname, certificate, or stack writes'
    $before = $global:activationFixture.apps | ConvertTo-Json -Depth 30 -Compress
    $global:activationFixture.writes.Clear(); $global:activationFixture.events.Clear()
    $result = Invoke-Activation -Action sync-auth-origin | ConvertFrom-Json
    Assert-True ($result.status -eq 'auth-origin-configured') 'no-change rerun succeeds'
    Assert-NoWrites
    Assert-True (($global:activationFixture.apps | ConvertTo-Json -Depth 30 -Compress) -ceq $before) 'no-change rerun preserves all app state'
  }
  'auth origin accepts only empty value normalization beside an unchanged secret reference' = {
    Set-FixtureBinding
    $global:activationFixture.mutation = 'bff/empty-secret-value'
    $result = Invoke-Activation -Action sync-auth-origin | ConvertFrom-Json
    Assert-True ($result.status -eq 'auth-origin-configured') 'empty serialized value does not change a secret reference'
    Reset-ActivationFixture
    Set-FixtureBinding
    $global:activationFixture.mutation = 'bff/literal-secret-value'
    Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'Unexpected runtime change during origin migration'
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'origin:bff') 'literal value stops migration before web update'
  }
  'auth origin waits for updated replicas before migrating the next app' = {
    Set-FixtureBinding
    $global:activationFixture.failure = 'origin-readiness'
    Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'has not passed replica readiness'
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'origin:bff') 'unready BFF prevents web migration'
    Assert-True (-not $global:activationFixture.events.Contains('origin:web')) 'web not updated'
  }
  'auth origin updates just the stale callback when the other value already matches' = {
    Set-FixtureBinding
    foreach ($app in $global:activationFixture.apps.Values) {
      $app.properties.template.containers[0].env[3].value = 'https://apply-dev.los.example.test/auth/callback'
    }
    Invoke-Activation -Action sync-auth-origin | Out-Null
    $updates = @($global:activationFixture.calls | Where-Object { $_ -match '^containerapp update ' })
    Assert-True ($updates.Count -eq 2) 'one targeted update per app'
    Assert-True (@($updates | Where-Object { $_ -match 'ACME_OKTA_REDIRECT_URI=' }).Count -eq 0) 'unchanged key omitted'
  }
  'auth origin rejects missing or duplicate callback settings' = {
    foreach ($kind in @('web', 'bff')) {
      foreach ($shape in @('missing', 'duplicate')) {
        Reset-ActivationFixture
        Set-FixtureBinding
        $container = $global:activationFixture.apps[$kind].properties.template.containers[0]
        if ($shape -eq 'missing') { $container.env = @($container.env | Where-Object { $_.name -ne 'ACME_OKTA_REDIRECT_URI' }) }
        else { $container.env += $container.env[3] }
        Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'callback setting is missing or ambiguous'
        Assert-True (-not $global:activationFixture.writes.Contains("origin:$kind")) 'invalid app never updated'
        Assert-MockSafety
      }
    }
  }
  'auth origin requires callback update readback and stops before the second app on failure' = {
    Set-FixtureBinding
    $global:activationFixture.failure = 'origin-readback'
    Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'callback configuration did not persist'
    Assert-True (($global:activationFixture.writes -join ',') -ceq 'origin:bff') 'no web update or rollback after BFF readback failure'
  }
  'auth origin still protects images, other config, secret references, identities, ingress, and scale' = {
    foreach ($kind in @('web', 'bff')) {
      foreach ($field in @('image', 'config', 'secretref', 'keyvault', 'identity', 'ingress', 'scale')) {
        Reset-ActivationFixture
        Set-FixtureBinding
        $global:activationFixture.mutation = "$kind/$field"
        Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'Unexpected runtime change during origin migration'
        Assert-True ($global:activationFixture.writes.Count -eq $(if ($kind -eq 'bff') { 1 } else { 2 })) 'no subsequent mutation or rollback'
        Assert-MockSafety
      }
    }
  }
  'auth origin must preserve the existing HTTPS hostname binding' = {
    Set-FixtureBinding
    $global:activationFixture.mutation = 'web/hostname'
    Assert-Fails { Invoke-Activation -Action sync-auth-origin } 'Unexpected runtime change during origin migration|HTTPS binding did not persist'
  }
}

# Keep mocks local to this script and make native az/node/build tools unreachable.
$originalPath = $env:PATH
$originalExitCode = Get-Variable LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
$originalExitCodeValue = if ($originalExitCode) { $originalExitCode.Value } else { $null }
$originalFixture = Get-Variable activationFixture -Scope Global -ErrorAction SilentlyContinue
$originalFixtureValue = if ($originalFixture) { $originalFixture.Value } else { $null }
$failures = [Collections.Generic.List[string]]::new()
try {
  $env:PATH = ''
  foreach ($test in $tests.GetEnumerator()) {
    Reset-ActivationFixture
    try {
      & $test.Value
      Assert-MockSafety
      Write-Host "PASS $($test.Key)"
    } catch {
      $message = "FAIL $($test.Key): $($_.Exception.Message)"
      $failures.Add($message)
      Write-Host $message
    }
  }
} finally {
  $env:PATH = $originalPath
  if ($null -ne $originalExitCode) { $global:LASTEXITCODE = $originalExitCodeValue }
  else { Remove-Variable LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue }
  if ($null -ne $originalFixture) { $global:activationFixture = $originalFixtureValue }
  else { Remove-Variable activationFixture -Scope Global -ErrorAction SilentlyContinue }
}
if ($failures.Count -gt 0) { throw ($failures -join [Environment]::NewLine) }
Write-Host "$($tests.Count) activation command tests passed. All Azure, DNS, and HTTP calls were mocked."
