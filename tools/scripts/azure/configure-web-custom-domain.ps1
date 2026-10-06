[CmdletBinding()]
param(
  [ValidateSet('dev', 'qa', 'stg', 'prod')]
  [Parameter(Mandatory = $true)]
  [string]$EnvironmentName,

  [ValidateSet('show-plan', 'verify-dns', 'plan-dns', 'sync-dns')]
  [string]$Action = 'show-plan',

  [string]$SubscriptionId,
  [string]$PlatformSubscriptionId,
  [string]$ConfigurationPath,
  [string]$ConfirmDnsZone,
  [ValidateRange(1, 60)]
  [int]$DnsAttempts = 1,
  [ValidateRange(1, 60)]
  [int]$DnsRetrySeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'runtime-region.ps1')

if (-not $ConfigurationPath) {
  $ConfigurationPath = Join-Path $PSScriptRoot '..\..\..\infra\azure\config\platform.json'
}

function Test-RequiredCommand {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function ConvertTo-ObjectArray {
  param($InputObject)

  if ($null -eq $InputObject) {
    return [object[]]@()
  }

  return [object[]]@($InputObject)
}

function Invoke-AzJson {
  param([string[]]$Arguments)

  $resolvedArguments = @($Arguments) + @('--output', 'json', '--only-show-errors')
  $commandOutput = az @resolvedArguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    $errorMessage = [string]::Join([Environment]::NewLine, $commandOutput)
    throw "Azure CLI command failed: az $($Arguments -join ' ')`n$errorMessage"
  }

  $jsonPayload = [string]::Join([Environment]::NewLine, $commandOutput)
  if ([string]::IsNullOrWhiteSpace($jsonPayload)) {
    return $null
  }

  return $jsonPayload | ConvertFrom-Json
}

function Resolve-SubscriptionIdByDisplayName {
  param([string]$DisplayName)

  $subscriptions = ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('account', 'subscription', 'list'))
  $subscription = $subscriptions | Where-Object { $_.displayName -eq $DisplayName } | Select-Object -First 1
  if ($subscription) {
    return [string]$subscription.subscriptionId
  }

  throw "Unable to resolve Azure subscription '$DisplayName'."
}

function Get-WorkloadResourceGroupName {
  param($Configuration, [string]$EnvironmentName)

  return Get-WebRuntimeResourceGroupName $Configuration $EnvironmentName
}

function Get-ContainerAppName {
  param($Configuration, [string]$EnvironmentName)

  return "ca-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$((Get-WebRuntimeRegion $Configuration $EnvironmentName).ShortName)-01".ToLowerInvariant()
}

function Get-ContainerAppEnvironmentName {
  param($Configuration, [string]$EnvironmentName)

  return "cae-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-$EnvironmentName-$((Get-WebRuntimeRegion $Configuration $EnvironmentName).ShortName)-01".ToLowerInvariant()
}

Test-RequiredCommand -Name 'az'

$configuration = Get-Content -Raw -LiteralPath $ConfigurationPath | ConvertFrom-Json
$environmentProperty = $configuration.environments.PSObject.Properties[$EnvironmentName]

if (-not $environmentProperty) {
  throw "Unknown Azure environment '$EnvironmentName'."
}

$environmentConfiguration = $environmentProperty.Value
$publicDomainProperty = $environmentConfiguration.PSObject.Properties['publicDomain']
$publicDomain = if ($publicDomainProperty) { $publicDomainProperty.Value } else { $null }
if (-not $publicDomain -or [string]::IsNullOrWhiteSpace([string]$publicDomain.hostname)) {
  throw "Environment '$EnvironmentName' does not declare publicDomain.hostname in '$ConfigurationPath'."
}

$hostname = ([string]$publicDomain.hostname).Trim().ToLowerInvariant()
$validationMethodProperty = $publicDomain.PSObject.Properties['managedCertificateValidationMethod']
$validationMethod = if ($validationMethodProperty -and $validationMethodProperty.Value) {
  ([string]$validationMethodProperty.Value).Trim().ToUpperInvariant()
} else {
  'CNAME'
}

if ($validationMethod -ne 'CNAME') {
  throw "This script currently supports subdomain CNAME managed-certificate validation only."
}

$targetSubscriptionName = if ($environmentConfiguration.subscriptionRole -eq 'prod') {
  $configuration.subscriptions.prodOnline
} else {
  $configuration.subscriptions.nonprodOnline
}
$resolvedSubscriptionId = if ($SubscriptionId) {
  $SubscriptionId
} else {
  Resolve-SubscriptionIdByDisplayName -DisplayName $targetSubscriptionName
}
$resourceGroupName = Get-WorkloadResourceGroupName -Configuration $configuration -EnvironmentName $EnvironmentName
$containerAppName = Get-ContainerAppName -Configuration $configuration -EnvironmentName $EnvironmentName
$containerAppEnvironmentName = Get-ContainerAppEnvironmentName -Configuration $configuration -EnvironmentName $EnvironmentName
$containerApp = Invoke-AzJson -Arguments @(
  'containerapp', 'show',
  '--subscription', $resolvedSubscriptionId,
  '--resource-group', $resourceGroupName,
  '--name', $containerAppName
)
$generatedFqdn = [string]$containerApp.properties.configuration.ingress.fqdn
$verificationId = [string]$containerApp.properties.customDomainVerificationId

if ([string]::IsNullOrWhiteSpace($generatedFqdn) -or [string]::IsNullOrWhiteSpace($verificationId)) {
  throw "Container app '$containerAppName' did not expose ingress FQDN and domain verification values."
}

$txtRecordName = "asuid.$hostname"
$plan = [ordered]@{
  environmentName = $EnvironmentName
  subscriptionId = $resolvedSubscriptionId
  resourceGroupName = $resourceGroupName
  containerAppName = $containerAppName
  containerAppEnvironmentName = $containerAppEnvironmentName
  hostname = $hostname
  dnsRecords = [ordered]@{
    cname = [ordered]@{ name = $hostname; value = $generatedFqdn }
    txt = [ordered]@{ name = $txtRecordName; value = $verificationId }
  }
  validationMethod = $validationMethod
  activation = 'After DNS verifies and publicDomain.enabled=true, use activate-web-custom-domain.ps1 for existing apps. New environments use the staged azure:deploy:web path.'
}

if ($Action -eq 'show-plan') {
  $plan | ConvertTo-Json -Depth 4
  return
}

if ($Action -in @('plan-dns', 'sync-dns')) {
  . (Join-Path $PSScriptRoot 'azure-dns.ps1')
  $dns = Get-AzureWebDnsConfiguration $configuration $EnvironmentName $PlatformSubscriptionId
  if ($Action -eq 'sync-dns') {
    if ($ConfirmDnsZone -cne $dns.Zone) { throw 'ConfirmDnsZone must match the delegated Azure DNS zone.' }
    Assert-AzureWebDnsDelegation $dns (Get-AzureWebDnsZone $dns)
  }
  $plan.dnsUpdate = Sync-AzureWebDns $dns -Target $generatedFqdn -VerificationId $verificationId `
    -ContainerAppName $containerAppName -Apply:($Action -eq 'sync-dns') -ConfirmZone $ConfirmDnsZone
  if ($Action -eq 'plan-dns') {
    $plan | ConvertTo-Json -Depth 5
    return
  }
}

Test-RequiredCommand -Name 'node'
for ($attempt = 1; $attempt -le $DnsAttempts; $attempt++) {
  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $null = & node (Join-Path $PSScriptRoot 'verify-public-dns.mjs') $hostname $generatedFqdn $verificationId 2>&1
    $dnsExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousErrorPreference }
  if ($dnsExitCode -eq 0) {
    $plan.status = 'dns-verified'
    $plan | ConvertTo-Json -Depth 5
    return
  }
  if ($attempt -lt $DnsAttempts) { Start-Sleep -Seconds $DnsRetrySeconds }
}
throw "Public DNS for '$hostname' did not verify. No certificate activation was attempted; inspect propagation before retrying."
