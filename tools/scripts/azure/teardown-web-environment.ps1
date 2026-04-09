[CmdletBinding()]
param(
  [ValidateSet('dev', 'qa', 'stg', 'prod')]
  [Parameter(Mandatory = $true)]
  [string]$EnvironmentName,

  [string]$SubscriptionId,
  [string]$PlatformSubscriptionId,
  [string]$ConfigurationPath,
  [switch]$WaitForDeletion,
  [switch]$PurgeDeletedKeyVault = $true,
  [switch]$AllowProductionTeardown
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

function Resolve-EnvironmentSubscriptionId {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  $environmentConfiguration = $Configuration.environments.PSObject.Properties[$EnvironmentName].Value
  $targetDisplayName = if ($environmentConfiguration.subscriptionRole -eq 'prod') {
    $Configuration.subscriptions.prodOnline
  } else {
    $Configuration.subscriptions.nonprodOnline
  }

  return Resolve-SubscriptionIdByDisplayName -DisplayName $targetDisplayName -FailureMessage "Unable to resolve the subscription '$targetDisplayName' for environment '$EnvironmentName'."
}

function Resolve-PlatformSubscriptionId {
  param($Configuration)

  return Resolve-SubscriptionIdByDisplayName -DisplayName $Configuration.subscriptions.platform -FailureMessage "Unable to resolve the platform subscription '$($Configuration.subscriptions.platform)'."
}

function Get-WorkloadResourceGroupName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "rg-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-KeyVaultName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "kv$($Configuration.organizationShortName)$($Configuration.workloadShortName)$EnvironmentName$($Configuration.primaryRegionShortName)01$($Configuration.resourceNameSuffix)".ToLowerInvariant()
}

function Get-SubscriptionStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ResourceGroupStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-app-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-PlatformNetworkResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.networkResourceGroupName
}

function Get-PlatformWorkloadLinksStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-dns-links-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-PlatformMonitorResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.monitorResourceGroupName
}

function Get-PlatformMonitoringStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-monitor-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

Test-RequiredCommand -Name 'az'

if (-not (Test-Path -LiteralPath $ConfigurationPath)) {
  throw "Configuration file '$ConfigurationPath' was not found."
}

$configuration = Get-JsonFile -Path $ConfigurationPath
$resolvedSubscriptionId = if ($SubscriptionId) { $SubscriptionId } else { Resolve-EnvironmentSubscriptionId -Configuration $configuration -EnvironmentName $EnvironmentName }
$resolvedPlatformSubscriptionId = if ($PlatformSubscriptionId) { $PlatformSubscriptionId } else { Resolve-PlatformSubscriptionId -Configuration $configuration }

$subscriptionStackName = Get-SubscriptionStackName -Configuration $configuration -EnvironmentName $EnvironmentName
$resourceGroupStackName = Get-ResourceGroupStackName -Configuration $configuration -EnvironmentName $EnvironmentName
$platformWorkloadLinksStackName = Get-PlatformWorkloadLinksStackName -Configuration $configuration -EnvironmentName $EnvironmentName
$platformNetworkResourceGroupName = Get-PlatformNetworkResourceGroupName -Configuration $configuration
$platformMonitorResourceGroupName = Get-PlatformMonitorResourceGroupName -Configuration $configuration
$platformMonitoringStackName = Get-PlatformMonitoringStackName -Configuration $configuration -EnvironmentName $EnvironmentName
$resourceGroupName = Get-WorkloadResourceGroupName -Configuration $configuration -EnvironmentName $EnvironmentName
$keyVaultName = Get-KeyVaultName -Configuration $configuration -EnvironmentName $EnvironmentName

if ($EnvironmentName -eq 'prod' -and -not $AllowProductionTeardown.IsPresent) {
  throw 'Production teardown is blocked by default. Re-run with -AllowProductionTeardown only when you explicitly intend destructive cleanup.'
}

try {
  az stack group show --subscription $resolvedSubscriptionId --name $resourceGroupStackName --resource-group $resourceGroupName --output none
  az stack group delete --subscription $resolvedSubscriptionId --name $resourceGroupStackName --resource-group $resourceGroupName --action-on-unmanage deleteResources --yes --output none
} catch {
}

try {
  az stack group show --subscription $resolvedPlatformSubscriptionId --name $platformWorkloadLinksStackName --resource-group $platformNetworkResourceGroupName --output none
  az stack group delete --subscription $resolvedPlatformSubscriptionId --name $platformWorkloadLinksStackName --resource-group $platformNetworkResourceGroupName --action-on-unmanage deleteResources --yes --output none
} catch {
}

try {
  az stack group show --subscription $resolvedPlatformSubscriptionId --name $platformMonitoringStackName --resource-group $platformMonitorResourceGroupName --output none
  az stack group delete --subscription $resolvedPlatformSubscriptionId --name $platformMonitoringStackName --resource-group $platformMonitorResourceGroupName --action-on-unmanage deleteResources --yes --output none
} catch {
}

try {
  az stack sub show --subscription $resolvedSubscriptionId --name $subscriptionStackName --output none
  az stack sub delete --subscription $resolvedSubscriptionId --name $subscriptionStackName --action-on-unmanage deleteResources --yes --output none
} catch {
}

$resourceGroupExists = az group exists --subscription $resolvedSubscriptionId --name $resourceGroupName --output tsv

if ($resourceGroupExists -eq 'true' -and $WaitForDeletion.IsPresent) {
  $attempt = 0

  do {
    Start-Sleep -Seconds 10
    $attempt += 1
    $resourceGroupExists = az group exists --subscription $resolvedSubscriptionId --name $resourceGroupName --output tsv
  } while ($resourceGroupExists -eq 'true' -and $attempt -lt 60)
}

$purgedKeyVault = $false

if ($PurgeDeletedKeyVault.IsPresent) {
  $deletedVault = $null
  $attempt = 0
  $maxAttempts = if ($WaitForDeletion.IsPresent) { 12 } else { 1 }

  do {
    $deletedVaults = az keyvault list-deleted --query "[].{name:name, location:properties.location}" --output json | ConvertFrom-Json
    $deletedVault = $deletedVaults | Where-Object { $_.name -eq $keyVaultName } | Select-Object -First 1

    if (-not $deletedVault -and $attempt -lt ($maxAttempts - 1)) {
      Start-Sleep -Seconds 5
    }

    $attempt += 1
  } while (-not $deletedVault -and $attempt -lt $maxAttempts)

  if ($deletedVault) {
    az keyvault purge --name $keyVaultName --location $deletedVault.location --output none
    $purgedKeyVault = $true
  }
}

[ordered]@{
  environmentName = $EnvironmentName
  subscriptionId = $resolvedSubscriptionId
  platformSubscriptionId = $resolvedPlatformSubscriptionId
  subscriptionStackName = $subscriptionStackName
  resourceGroupStackName = $resourceGroupStackName
  platformWorkloadLinksStackName = $platformWorkloadLinksStackName
  platformNetworkResourceGroupName = $platformNetworkResourceGroupName
  platformMonitorResourceGroupName = $platformMonitorResourceGroupName
  platformMonitoringStackName = $platformMonitoringStackName
  resourceGroupName = $resourceGroupName
  resourceGroupExists = ($resourceGroupExists -eq 'true')
  keyVaultName = $keyVaultName
  keyVaultPurged = $purgedKeyVault
} | ConvertTo-Json -Depth 5
