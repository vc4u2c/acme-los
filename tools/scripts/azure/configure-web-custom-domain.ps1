[CmdletBinding()]
param(
  [ValidateSet('dev', 'qa', 'stg', 'prod')]
  [Parameter(Mandatory = $true)]
  [string]$EnvironmentName,

  [ValidateSet('show-plan', 'verify-dns')]
  [string]$Action = 'show-plan',

  [string]$SubscriptionId,
  [string]$ConfigurationPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

  return "rg-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ContainerAppName {
  param($Configuration, [string]$EnvironmentName)

  return "ca-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ContainerAppEnvironmentName {
  param($Configuration, [string]$EnvironmentName)

  return "cae-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
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
  activation = 'After DNS verifies, set publicDomain.enabled=true and deploy through azure:deploy:web so Bicep owns the certificate and hostname binding.'
}

if ($Action -eq 'show-plan') {
  $plan | ConvertTo-Json -Depth 4
  return
}

$resolvedCname = Resolve-DnsName -Name $hostname -Type CNAME -ErrorAction Stop |
  Where-Object { $_.NameHost } |
  Select-Object -First 1
$actualCname = ([string]$resolvedCname.NameHost).TrimEnd('.').ToLowerInvariant()

if ($actualCname -ne $generatedFqdn.ToLowerInvariant()) {
  throw "CNAME '$hostname' resolves to '$actualCname'; expected '$generatedFqdn'."
}

$resolvedTxtValues = @(
  Resolve-DnsName -Name $txtRecordName -Type TXT -ErrorAction Stop |
    ForEach-Object { [string]::Join('', $_.Strings) }
)

if ($resolvedTxtValues -notcontains $verificationId) {
  throw "TXT '$txtRecordName' does not contain the required Azure domain verification value."
}

$plan.status = 'dns-verified'
$plan | ConvertTo-Json -Depth 4
