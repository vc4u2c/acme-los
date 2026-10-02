[CmdletBinding()]
param(
  [ValidateSet('show-plan', 'prepare', 'retire', 'rebuild')][string]$Action = 'show-plan',
  [Parameter(Mandatory = $true)][guid]$SubscriptionId,
  [Parameter(Mandatory = $true)][guid]$PlatformSubscriptionId,
  [string]$ConfirmResourceGroup,
  [switch]$DiscardDemoData,
  [string]$ConfigurationPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'azure-dns.ps1')
. (Join-Path $PSScriptRoot 'private-connectivity.ps1')
. (Join-Path $PSScriptRoot 'public-domain.ps1')
. (Join-Path $PSScriptRoot 'dev-retirement.ps1')
function Invoke-AzJson { param([string[]]$Arguments) return Invoke-AzureDnsJson $Arguments }

if (-not $ConfigurationPath) { $ConfigurationPath = Join-Path $PSScriptRoot '../../../infra/azure/config/platform.json' }
$configuration = Get-Content -LiteralPath $ConfigurationPath -Raw | ConvertFrom-Json
$scope = Get-DevRetirementScope $configuration $SubscriptionId $PlatformSubscriptionId
if ($Action -ne 'show-plan' -and $ConfirmResourceGroup -cne $scope.Group) { throw "This operation requires -ConfirmResourceGroup '$($scope.Group)'." }
if ($Action -eq 'retire' -and -not $DiscardDemoData) { throw 'Retirement permanently discards dev Redis data and requires -DiscardDemoData.' }
foreach ($accountCheck in @(@($scope.Subscription, $configuration.subscriptions.nonprodOnline), @($scope.PlatformSubscription, $configuration.subscriptions.platform))) {
  $account = Invoke-AzureDnsJson @('account', 'show', '--subscription', $accountCheck[0])
  if ($account.id -ine $accountCheck[0] -or $account.name -cne $accountCheck[1]) { throw 'Subscription does not match the source-owned dev/platform contract.' }
}
$group = Invoke-AzureDnsJson @('group', 'show', '--subscription', $scope.Subscription, '--name', $scope.Group)
if ($group.tags.'acme:application' -cne 'acme-los' -or $group.tags.'acme:environment' -cne 'dev') { throw 'Unexpected workload resource-group ownership.' }
Assert-NoActiveWorkloadDeployment $scope.Subscription $scope.Group
$dns = Get-AzureWebDnsConfiguration $configuration 'dev' $scope.PlatformSubscription
Assert-AzureWebDnsDelegation $dns (Get-AzureWebDnsZone $dns)
Clear-RetirementCname $dns
$fingerprint = Get-RetirementProtectedFingerprint $scope
$markerProperty = $group.tags.PSObject.Properties['acme:retirement']
$marker = if ($markerProperty) { [string]$markerProperty.Value } else { 'active' }
$retry = $Action -in @('retire', 'rebuild') -and $marker -in @('retiring', 'rebuilding')
$preparationRetry = $Action -eq 'prepare' -and $marker -eq 'preparing'
$retained = Get-RetirementStack $scope $scope.RetainedStack
$phaseProperty = $retained.parameters.PSObject.Properties['resourcePhase']
$phase = if ($phaseProperty) { [string]$phaseProperty.Value.value } else { 'all' }
$validationPhase = if ($preparationRetry -and $retained.provisioningState -in @('failed', 'canceled')) { 'all' } else { $phase }
Assert-RetirementStack $scope $retained $validationPhase -AllowFailed:$preparationRetry -AllowPartial:$preparationRetry
$disposable = Get-RetirementStack $scope $scope.DisposableStack
if ($disposable) { Assert-RetirementStack $scope $disposable 'disposable' -AllowFailed:($retry -or $preparationRetry) -AllowPartial:($retry -or $preparationRetry) }
$apps = @(Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', "$($scope.Id)/providers/Microsoft.App/containerApps?api-version=2025-01-01") | ForEach-Object { $_.value })
foreach ($app in $apps) {
  if ($app.properties.environmentId -ieq $scope.EnvironmentId -and $app.name -notin $scope.AppNames) { throw 'Another app uses the dev environment; retirement would affect it.' }
}
$savedFingerprint = $group.tags.PSObject.Properties['acme:recovery-retained-hash']
if ($savedFingerprint -and $savedFingerprint.Value -cne $fingerprint) { throw 'Retained identity or secret metadata differs from the recovery record. Review before proceeding.' }

if ($Action -eq 'show-plan') {
  [ordered]@{ action = $Action; state = $marker; ownership = $phase; subscription = $scope.Subscription; resourceGroup = $scope.Group
    retainedStack = $scope.RetainedStack; disposableStack = $scope.DisposableStack; disposableStackExists = [bool]$disposable
    hostname = $dns.Hostname; discard = @('Both container apps', 'ACA environment and its managed networking', 'Dev Redis data', 'Two private endpoints and NICs', 'Managed app certificate')
    preserve = @('Public DNS zone and delegation', 'Key Vault and secrets', 'Runtime and deployment identities', 'ACS and phone', 'Registry and images', 'Shared monitoring', 'Free VNet/NSGs/private DNS links', 'Okta')
    note = 'Retirement clears only the app CNAME target, retaining its empty record set and zone lock. Rebuild republishes it. No resource group or retained stack is deleted.'
  } | ConvertTo-Json -Depth 5
  return
}

if ($Action -eq 'prepare') {
  if ($marker -notin @('active', 'preparing')) { throw 'Prepare requires an active environment or an interrupted preparation.' }
  $metadata = Get-RetirementImageMetadata $scope $apps $group.tags -AllowNewBuild
  $metadata['acme:recovery-retained-hash'] = $fingerprint
  Invoke-RetirementPhase $scope $retained.parameters 'retained' -ValidateOnly
  Invoke-RetirementPhase $scope $retained.parameters 'disposable' -ValidateOnly
  $expectedRetainedIds = @($retained.resources | Where-Object { (Get-RetirementResourceClass $scope $_.id) -eq 'retained' } | ForEach-Object { $_.id.ToLowerInvariant() } | Sort-Object)
  $metadata['acme:retirement'] = 'preparing'
  Set-RetirementTags $scope $metadata
  Invoke-RetirementPhase $scope $retained.parameters 'retained'
  $newRetained = Get-RetirementStack $scope $scope.RetainedStack
  Assert-RetirementStack $scope $newRetained 'retained'
  $actualRetainedIds = @($newRetained.resources | ForEach-Object { $_.id.ToLowerInvariant() } | Sort-Object)
  if (@($expectedRetainedIds | Where-Object { $_ -notin $actualRetainedIds }).Count -or
    (-not $preparationRetry -and @(Compare-Object $expectedRetainedIds $actualRetainedIds).Count)) { throw 'Retained stack ownership changed unexpectedly. No runtime deletion was performed.' }
  Invoke-RetirementPhase $scope $retained.parameters 'disposable'
  Assert-RetirementStack $scope (Get-RetirementStack $scope $scope.DisposableStack) 'disposable'
  if ((Get-RetirementProtectedFingerprint $scope) -cne $fingerprint) { throw 'Retained resources changed during preparation.' }
  Set-RetirementTags $scope @{ 'acme:retirement' = 'active' }
  Write-Output 'Prepared: retained and disposable stacks are separate; no workload resource was deleted.'
  return
}

if ($phase -ne 'retained' -or -not $savedFingerprint) { throw 'Run prepare successfully before retirement or recovery.' }
if ($Action -eq 'retire') {
  if ($marker -notin @('active', 'retiring', 'retired', 'rebuilding')) { throw 'Unsupported retirement state.' }
  if ($marker -eq 'active') {
    if (-not $disposable) { throw 'The disposable stack is missing from an active environment.' }
    $metadata = Get-RetirementImageMetadata $scope $apps $group.tags
    $metadata['acme:retirement'] = 'retiring'
    Set-RetirementTags $scope $metadata
  } else { Set-RetirementTags $scope @{ 'acme:retirement' = 'retiring' } }
  Set-RetirementAlerts $scope $configuration $false
  Clear-RetirementCname $dns -Apply
  Assert-NoActiveWorkloadDeployment $scope.Subscription $scope.Group
  foreach ($name in $scope.AppNames) {
    $id = "$($scope.Id)/providers/Microsoft.App/containerApps/$name"
    $app = Get-ConnectivityResource $id '2025-01-01'
    if ($app) {
      if ($app.properties.environmentId -ine $scope.EnvironmentId) { throw 'App environment changed before deletion.' }
      Invoke-AzureDnsJson @('containerapp', 'delete', '--subscription', $scope.Subscription, '--resource-group', $scope.Group, '--name', $name, '--yes') | Out-Null
    }
    if (Get-ConnectivityResource $id '2025-01-01') { throw 'Container app deletion did not complete.' }
  }
  if ($disposable) {
    $disposable = Get-RetirementStack $scope $scope.DisposableStack
    Assert-RetirementStack $scope $disposable 'disposable' -AllowFailed:$retry -AllowPartial:$retry
    Invoke-AzureDnsJson @('stack', 'group', 'delete', '--subscription', $scope.Subscription, '--resource-group', $scope.Group, '--name', $scope.DisposableStack, '--action-on-unmanage', 'deleteResources', '--yes') | Out-Null
  }
  foreach ($resource in @(@($scope.EnvironmentId, '2025-01-01'), @($scope.RedisId, '2025-07-01'))) {
    if (Get-ConnectivityResource $resource[0] $resource[1]) { throw 'A disposable service is still allocated.' }
  }
  foreach ($kind in @('kv', 'redis')) {
    foreach ($resource in @("privateEndpoints/pep-acme-los-$kind-dev-cus-01", "networkInterfaces/nic-acme-los-$kind-dev-cus-01")) {
      if (Get-ConnectivityResource "$($scope.Id)/providers/Microsoft.Network/$resource") { throw 'A private endpoint or NIC is still allocated.' }
    }
  }
  $networkAbsent = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $managedGroup = Invoke-AzureDnsJson @('group', 'show', '--subscription', $scope.Subscription, '--name', $scope.InfrastructureGroup) -AllowMissing
    if (-not $managedGroup) { $networkAbsent = $true; break }
    $remaining = @(Invoke-AzureDnsJson @('resource', 'list', '--subscription', $scope.Subscription, '--resource-group', $scope.InfrastructureGroup) | ForEach-Object { $_ })
    if ($remaining.Count -eq 0) { $networkAbsent = $true; break }
    Start-Sleep -Seconds 20
  }
  if (-not $networkAbsent) { throw 'Azure has not released the ACA-managed infrastructure. Marker remains retiring; do not delete unknown managed resources manually.' }
  if ((Get-RetirementProtectedFingerprint $scope) -cne $fingerprint) { throw 'Retained resources changed during retirement.' }
  Assert-RetirementStack $scope (Get-RetirementStack $scope $scope.RetainedStack) 'retained'
  Set-RetirementTags $scope @{ 'acme:retirement' = 'retired'; 'acme:hibernated' = 'false' }
  Write-Output 'Retired: apps, ACA environment/networking, Redis, and private endpoints are absent. Retained services and secrets are unchanged.'
  return
}

if ($marker -notin @('retired', 'rebuilding')) { throw 'Rebuild requires a retired environment or interrupted recovery.' }
Set-RetirementTags $scope @{ 'acme:retirement' = 'rebuilding' }
Set-RetirementAlerts $scope $configuration $false
& (Join-Path $PSScriptRoot 'deploy-web-environment.ps1') -EnvironmentName dev -SubscriptionId $scope.Subscription `
  -PlatformSubscriptionId $scope.PlatformSubscription -ConfigurationPath $ConfigurationPath -BffDeploymentMode enabled `
  -ImageTag $group.tags.'acme:recovery-image-tag' -BffVersion $group.tags.'acme:recovery-bff-version' `
  -WebImageDigest $group.tags.'acme:recovery-web-digest' -BffImageDigest $group.tags.'acme:recovery-bff-digest' `
  -ReuseExistingImages -RecoverRetiredResourceGroup $scope.Group -SyncPublicDns -ConfirmDnsZone $dns.Zone | Out-Host
foreach ($name in $scope.AppNames) { Wait-ForContainerAppReady $scope.Subscription $scope.Group $name }
$connectivity = @(Get-DevPrivateConnectivityPlan $configuration $scope.Subscription $scope.PlatformSubscription $scope.Group)
if (@($connectivity | Where-Object { -not $_.ready }).Count) { throw 'Recreated private endpoints or DNS are not ready.' }
Wait-WebCustomDomainHealth -Hostname $dns.Hostname -EnvironmentName dev -BuildId $group.tags.'acme:recovery-image-tag'.Substring(0, 8)
if ((Get-RetirementProtectedFingerprint $scope) -cne $fingerprint) { throw 'Retained identity or secret versions changed during recovery.' }
Set-RetirementAlerts $scope $configuration $true
Set-RetirementTags $scope @{ 'acme:retirement' = 'active'; 'acme:hibernated' = 'false' }
Write-Output "Rebuilt and healthy at https://$($dns.Hostname). Real sign-in, OTP, funding, and account-security journey verification is still required."
