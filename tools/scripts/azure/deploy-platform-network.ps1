[CmdletBinding()]
param(
  [string]$SubscriptionId,
  [string]$Location,
  [string]$ConfigurationPath,
  [string]$HubTemplateFile,
  [string]$PlatformNetworkTemplateFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ConfigurationPath) {
  $ConfigurationPath = Join-Path $PSScriptRoot '..\..\..\infra\azure\config\platform.json'
}

if (-not $HubTemplateFile) {
  $HubTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.hub.sub.bicep'
}

if (-not $PlatformNetworkTemplateFile) {
  $PlatformNetworkTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.platform.network.rg.bicep'
}

function Test-RequiredCommand {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Get-JsonFile {
  param([string]$Path)

  return Get-Content -Raw -Path $Path | ConvertFrom-Json
}

function ConvertTo-ObjectArray {
  param($InputObject)

  if ($null -eq $InputObject) {
    return [object[]]@()
  }

  $items = New-Object System.Collections.Generic.List[object]

  foreach ($item in $InputObject) {
    [void]$items.Add($item)
  }

  return [object[]]$items.ToArray()
}

function Resolve-SubscriptionIdByDisplayName {
  param(
    [string]$DisplayName,
    [string]$FailureMessage
  )

  $subscriptions = ConvertTo-ObjectArray (az account subscription list --output json | ConvertFrom-Json)
  $subscription = @(
    $subscriptions |
      Where-Object { $_.displayName -eq $DisplayName } |
      Select-Object -First 1
  )

  if ($subscription.Count -gt 0 -and $subscription[0]) {
    return [string]$subscription[0].subscriptionId
  }

  $entities = ConvertTo-ObjectArray (az account management-group entities list --output json | ConvertFrom-Json)
  $entity = @(
    $entities |
      Where-Object {
        $_.type -eq '/subscriptions' -and $_.displayName -eq $DisplayName
      } |
      Select-Object -First 1
  )

  if ($entity.Count -gt 0 -and $entity[0]) {
    return [string]$entity[0].name
  }

  throw $FailureMessage
}

function Resolve-PlatformSubscriptionId {
  param($Configuration)

  return Resolve-SubscriptionIdByDisplayName -DisplayName $Configuration.subscriptions.platform -FailureMessage "Unable to resolve the platform subscription '$($Configuration.subscriptions.platform)'."
}

function Get-StringOutputValue {
  param(
    $Outputs,
    [string]$Name
  )

  if ($null -eq $Outputs.$Name) {
    return ''
  }

  return [string]$Outputs.$Name.value
}

Test-RequiredCommand -Name 'az'

if (-not (Test-Path -LiteralPath $ConfigurationPath)) {
  throw "Configuration file '$ConfigurationPath' was not found."
}

if (-not (Test-Path -LiteralPath $HubTemplateFile)) {
  throw "Hub template '$HubTemplateFile' was not found."
}

if (-not (Test-Path -LiteralPath $PlatformNetworkTemplateFile)) {
  throw "Platform network template '$PlatformNetworkTemplateFile' was not found."
}

$configuration = Get-JsonFile -Path $ConfigurationPath
$hubRegionProperty = $configuration.platformResources.PSObject.Properties['hubRegionShortName']
$hubLocationProperty = $configuration.platformResources.PSObject.Properties['hubLocation']
$hubRegion = if ($hubRegionProperty) { [string]$hubRegionProperty.Value } else { [string]$configuration.primaryRegionShortName }
$hubLocation = if ($hubLocationProperty) { [string]$hubLocationProperty.Value } else { [string]$configuration.primaryLocation }
if ($Location -and $Location -cne $hubLocation) { throw 'Location must match the retained platform hub location; workload relocation does not move global DNS.' }
$Location = $hubLocation
$expectedNetworkGroup = "rg-$($configuration.organizationShortName)-hub-network-$hubRegion-01"
if ($configuration.platformResources.networkResourceGroupName -cne $expectedNetworkGroup) { throw 'Configured DNS group does not match the retained hub scaffold.' }
$regionalMonitor = $configuration.primaryRegionShortName -cne $hubRegion
$monitorTemplate = Join-Path $PSScriptRoot '../../../infra/azure/bicep/main.web.monitoring.sub.bicep'
if ($regionalMonitor -and ($configuration.organizationShortName -cne 'acme' -or $configuration.platformResources.monitorResourceGroupName -cne "rg-acme-hub-monitor-$($configuration.primaryRegionShortName)-01")) { throw 'Regional monitoring group does not match the source-owned scaffold.' }
$resolvedSubscriptionId = if ($SubscriptionId) { $SubscriptionId } else { Resolve-PlatformSubscriptionId -Configuration $configuration }
$platformNetworkResourceGroupName = [string]$configuration.platformResources.networkResourceGroupName
$keyVaultPrivateDnsZoneName = [string]$configuration.platformResources.privateDnsZones.keyVault
$managedRedisPrivateDnsZoneName = [string]$configuration.platformResources.privateDnsZones.managedRedis

$hubDeploymentArguments = @(
  'deployment', 'sub', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--name', "dep-acme-platform-hub-$hubRegion-01",
  '--location', $Location,
  '--template-file', $HubTemplateFile,
  '--parameters',
  "location=$Location",
  "organizationShortName=$($configuration.organizationShortName)",
  "regionShortName=$hubRegion"
)

$hubDeployment = az @hubDeploymentArguments --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Platform hub deployment failed; DNS deployment was not attempted.' }
$hubOutputs = $hubDeployment.properties.outputs
if ($regionalMonitor) {
  # DNS remains global in its retained hub; workload monitoring uses the new regional group.
  $monitorArguments = @('deployment', 'sub', 'create', '--subscription', $resolvedSubscriptionId,
    '--name', "dep-acme-monitor-$($configuration.primaryRegionShortName)-01", '--location', $configuration.primaryLocation,
    '--template-file', $monitorTemplate, '--parameters', "location=$($configuration.primaryLocation)", "regionShortName=$($configuration.primaryRegionShortName)", '--output', 'none')
  az @monitorArguments
  if ($LASTEXITCODE -ne 0) { throw 'Regional monitoring scaffold deployment failed.' }
}

$networkDeploymentArguments = @(
  'deployment', 'group', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--name', "dep-acme-platform-network-dns-$hubRegion-01",
  '--resource-group', $platformNetworkResourceGroupName,
  '--template-file', $PlatformNetworkTemplateFile,
  '--parameters',
  "keyVaultPrivateDnsZoneName=$keyVaultPrivateDnsZoneName",
  "managedRedisPrivateDnsZoneName=$managedRedisPrivateDnsZoneName"
)

$networkDeployment = az @networkDeploymentArguments --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Platform DNS deployment failed.' }
$networkOutputs = $networkDeployment.properties.outputs

[ordered]@{
  subscriptionId = $resolvedSubscriptionId
  edgeResourceGroupName = Get-StringOutputValue -Outputs $hubOutputs -Name 'edgeResourceGroupName'
  monitorResourceGroupName = [string]$configuration.platformResources.monitorResourceGroupName
  networkResourceGroupName = Get-StringOutputValue -Outputs $hubOutputs -Name 'networkResourceGroupName'
  keyVaultPrivateDnsZoneName = Get-StringOutputValue -Outputs $networkOutputs -Name 'keyVaultPrivateDnsZoneName'
  managedRedisPrivateDnsZoneName = Get-StringOutputValue -Outputs $networkOutputs -Name 'managedRedisPrivateDnsZoneName'
} | ConvertTo-Json -Depth 5
