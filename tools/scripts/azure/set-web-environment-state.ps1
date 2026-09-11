[CmdletBinding()]
param(
  [ValidateSet('dev', 'qa', 'stg', 'prod')]
  [Parameter(Mandatory = $true)]
  [string]$EnvironmentName,

  [ValidateSet('show-plan', 'pause', 'pause-apps', 'hibernate', 'resume')]
  [string]$Action = 'show-plan',

  [string]$SubscriptionId,
  [string]$PlatformSubscriptionId,
  [string]$ConfigurationPath,
  [bool]$WaitForDesiredState = $true,
  [switch]$SkipAlertSuppression,
  [switch]$AllowProductionPause
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requestedAction = $Action
if ($Action -eq 'pause' -and $EnvironmentName -eq 'dev') {
  $Action = 'hibernate'
} elseif ($Action -eq 'pause-apps') {
  $Action = 'pause'
}

if ($Action -eq 'hibernate' -and ($EnvironmentName -ne 'dev' -or -not $WaitForDesiredState -or $SkipAlertSuppression)) {
  throw 'Hibernate is dev-only and requires waiting for stopped apps and suppressing alerts.'
}
if ($Action -eq 'resume' -and $EnvironmentName -eq 'dev' -and (-not $WaitForDesiredState -or $SkipAlertSuppression)) {
  throw 'Dev resume requires waiting for private connectivity, application health, and alert restoration.'
}

. (Join-Path $PSScriptRoot 'private-connectivity.ps1')

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

  $subscriptions = ConvertTo-ObjectArray (az account subscription list --output json --only-show-errors | ConvertFrom-Json)
  $subscription = @(
    $subscriptions |
      Where-Object { $_.displayName -eq $DisplayName } |
      Select-Object -First 1
  )

  if ($subscription.Count -gt 0 -and $subscription[0]) {
    return [string]$subscription[0].subscriptionId
  }

  $entities = ConvertTo-ObjectArray (az account management-group entities list --output json --only-show-errors | ConvertFrom-Json)
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

function Get-ContainerAppName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "ca-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-BffContainerAppName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "ca-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-bff-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-PlatformMonitorResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.monitorResourceGroupName
}

function Get-AlertRuleNames {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  $base = "$($Configuration.organizationShortName)-$($Configuration.workloadShortName)"
  $region = $Configuration.primaryRegionShortName

  return @(
    "alrt-$base-failed-requests-$EnvironmentName-$region-01".ToLowerInvariant()
    "alrt-$base-exceptions-$EnvironmentName-$region-01".ToLowerInvariant()
    "alrt-$base-auth-failures-$EnvironmentName-$region-01".ToLowerInvariant()
    "alrt-$base-system-errors-$EnvironmentName-$region-01".ToLowerInvariant()
  )
}

function Get-ContainerAppResourceId {
  param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName,
    [string]$ContainerAppName
  )

  return "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.App/containerApps/$ContainerAppName"
}

function Get-ScheduledQueryRuleResourceId {
  param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName,
    [string]$RuleName
  )

  return "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.Insights/scheduledQueryRules/$RuleName"
}

function Invoke-AzJson {
  param([string[]]$Arguments)

  $resolvedArguments = New-Object System.Collections.Generic.List[string]

  foreach ($argument in $Arguments) {
    [void]$resolvedArguments.Add($argument)
  }

  if (-not ($resolvedArguments -contains '--output') -and -not ($resolvedArguments -contains '-o')) {
    [void]$resolvedArguments.Add('--output')
    [void]$resolvedArguments.Add('json')
  }

  if (-not ($resolvedArguments -contains '--only-show-errors')) {
    [void]$resolvedArguments.Add('--only-show-errors')
  }

  $commandOutput = az @($resolvedArguments.ToArray()) 2>&1
  if ($LASTEXITCODE -ne 0) {
    $errorMessage = [string]::Join([Environment]::NewLine, $commandOutput)
    throw "Azure CLI command failed: az $($Arguments -join ' ')`n$errorMessage"
  }

  if ($null -eq $commandOutput) {
    return $null
  }

  $jsonPayload = [string]::Join([Environment]::NewLine, $commandOutput)
  if ([string]::IsNullOrWhiteSpace($jsonPayload)) {
    return $null
  }

  return $jsonPayload | ConvertFrom-Json
}

function Invoke-AzNoOutput {
  param([string[]]$Arguments)

  $resolvedArguments = New-Object System.Collections.Generic.List[string]

  foreach ($argument in $Arguments) {
    [void]$resolvedArguments.Add($argument)
  }

  if (-not ($resolvedArguments -contains '--only-show-errors')) {
    [void]$resolvedArguments.Add('--only-show-errors')
  }

  $commandOutput = az @($resolvedArguments.ToArray()) 2>&1
  if ($LASTEXITCODE -ne 0) {
    $errorMessage = [string]::Join([Environment]::NewLine, $commandOutput)
    throw "Azure CLI command failed: az $($Arguments -join ' ')`n$errorMessage"
  }
}

function Get-ContainerAppState {
  param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName,
    [string]$ContainerAppName
  )

  try {
    return Invoke-AzJson -Arguments @(
      'containerapp', 'show',
      '--subscription', $SubscriptionId,
      '--resource-group', $ResourceGroupName,
      '--name', $ContainerAppName
    )
  } catch {
    if ($_.Exception.Message -match '\((ResourceNotFound|ContainerAppNotFound)\)') { return $null }
    throw
  }
}

function Get-AlertRuleState {
  param([string]$ResourceId)

  try {
    return Invoke-AzJson -Arguments @(
      'resource', 'show',
      '--ids', $ResourceId
    )
  } catch {
    if ($_.Exception.Message -match '\(ResourceNotFound\)') { return $null }
    throw
  }
}

function Set-AlertRuleEnabledState {
  param(
    [string]$ResourceId,
    [bool]$Enabled
  )

  Invoke-AzNoOutput -Arguments @(
    'resource', 'update',
    '--ids', $ResourceId,
    '--set', "properties.enabled=$($Enabled.ToString().ToLowerInvariant())",
    '--output', 'none'
  )
}

function Invoke-ContainerAppLifecycleAction {
  param(
    [string]$ResourceId,
    [ValidateSet('start', 'stop')]
    [string]$LifecycleAction
  )

  $uri = "$ResourceId/${LifecycleAction}?api-version=2024-03-01"

  Invoke-AzNoOutput -Arguments @(
    'rest',
    '--method', 'post',
    '--uri', $uri,
    '--output', 'none'
  )
}

function Wait-ForContainerAppRunningState {
  param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName,
    [string]$ContainerAppName,
    [string]$DesiredState
  )

  $maxAttempts = 60

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt += 1) {
    $state = Get-ContainerAppState -SubscriptionId $SubscriptionId -ResourceGroupName $ResourceGroupName -ContainerAppName $ContainerAppName

    if ($state -and $state.properties.runningStatus -eq $DesiredState) {
      return $state
    }

    Start-Sleep -Seconds 10
  }

  throw "Timed out waiting for container app '$ContainerAppName' to reach running status '$DesiredState'."
}

Test-RequiredCommand -Name 'az'

if (-not (Test-Path -LiteralPath $ConfigurationPath)) {
  throw "Configuration file '$ConfigurationPath' was not found."
}

$configuration = Get-JsonFile -Path $ConfigurationPath
$resolvedSubscriptionId = if ($SubscriptionId) { $SubscriptionId } else { Resolve-EnvironmentSubscriptionId -Configuration $configuration -EnvironmentName $EnvironmentName }
$resolvedPlatformSubscriptionId = if ($PlatformSubscriptionId) { $PlatformSubscriptionId } else { Resolve-PlatformSubscriptionId -Configuration $configuration }
$resourceGroupName = Get-WorkloadResourceGroupName -Configuration $configuration -EnvironmentName $EnvironmentName
$containerAppName = Get-ContainerAppName -Configuration $configuration -EnvironmentName $EnvironmentName
$bffContainerAppName = Get-BffContainerAppName -Configuration $configuration -EnvironmentName $EnvironmentName
$containerAppResourceId = Get-ContainerAppResourceId -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $resourceGroupName -ContainerAppName $containerAppName
$bffContainerAppResourceId = Get-ContainerAppResourceId -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $resourceGroupName -ContainerAppName $bffContainerAppName
$platformMonitorResourceGroupName = Get-PlatformMonitorResourceGroupName -Configuration $configuration
$alertRuleNames = Get-AlertRuleNames -Configuration $configuration -EnvironmentName $EnvironmentName
$manageAlerts = -not $SkipAlertSuppression.IsPresent

if ($EnvironmentName -eq 'prod' -and $Action -eq 'pause' -and -not $AllowProductionPause.IsPresent) {
  throw 'Production pause is blocked by default. Re-run with -AllowProductionPause only when you explicitly intend to stop the production container app.'
}

$containerAppState = Get-ContainerAppState -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $resourceGroupName -ContainerAppName $containerAppName
$bffContainerAppState = Get-ContainerAppState -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $resourceGroupName -ContainerAppName $bffContainerAppName

if (-not $containerAppState) {
  throw "Container app '$containerAppName' was not found in '$resourceGroupName'. Deploy the environment before using the workload state script."
}

$alertRuleStates = foreach ($alertRuleName in $alertRuleNames) {
  $alertRuleResourceId = Get-ScheduledQueryRuleResourceId -SubscriptionId $resolvedPlatformSubscriptionId -ResourceGroupName $platformMonitorResourceGroupName -RuleName $alertRuleName
  $alertRuleState = Get-AlertRuleState -ResourceId $alertRuleResourceId

  [pscustomobject]@{
    name = $alertRuleName
    resourceId = $alertRuleResourceId
    exists = ($null -ne $alertRuleState)
    enabled = if ($alertRuleState) { [bool]$alertRuleState.properties.enabled } else { $null }
  }
}

$desiredRunningState = switch ($Action) {
  'pause' { 'Stopped' }
  'hibernate' { 'Stopped' }
  'resume' { 'Running' }
  default { [string]$containerAppState.properties.runningStatus }
}

$operations = New-Object System.Collections.Generic.List[string]
$workloadContainerApps = @(
  [pscustomobject]@{
    role = 'web'
    name = $containerAppName
    resourceId = $containerAppResourceId
    exists = $true
    state = $containerAppState
  }
  [pscustomobject]@{
    role = 'bff'
    name = $bffContainerAppName
    resourceId = $bffContainerAppResourceId
    exists = ($null -ne $bffContainerAppState)
    state = $bffContainerAppState
  }
)

$privateConnectivity = @()
if ($EnvironmentName -eq 'dev' -and $Action -in @('show-plan', 'hibernate', 'resume')) {
  if (-not $bffContainerAppState) { throw 'Dev private connectivity lifecycle requires both deployed container apps.' }
  if ($Action -in @('hibernate', 'resume') -and @($alertRuleStates | Where-Object { -not $_.exists }).Count -gt 0) {
    throw 'All expected dev alerts must be readable before changing lifecycle state.'
  }
  $privateConnectivity = @(Get-DevPrivateConnectivityPlan $configuration $resolvedSubscriptionId $resolvedPlatformSubscriptionId $resourceGroupName)
  if ($Action -in @('hibernate', 'resume')) {
    Assert-NoActiveWorkloadDeployment $resolvedSubscriptionId $resourceGroupName
    Assert-PrivateConnectivityTemplate
    foreach ($entry in $privateConnectivity) {
      Invoke-PrivateConnectivityDeployment $entry 'validate'
    }
  }
}

if ($Action -eq 'hibernate') {
  Set-WebHibernationMarker $resolvedSubscriptionId $resourceGroupName $true
  Assert-NoActiveWorkloadDeployment $resolvedSubscriptionId $resourceGroupName
}

if ($Action -in @('pause', 'hibernate')) {
  if ($manageAlerts) {
    foreach ($alertRuleState in $alertRuleStates) {
      if ($alertRuleState.exists -and $alertRuleState.enabled) {
        Set-AlertRuleEnabledState -ResourceId $alertRuleState.resourceId -Enabled $false
        [void]$operations.Add("disabled-alert:$($alertRuleState.name)")
        $alertRuleState.enabled = $false
      }
    }
  }

  foreach ($workloadContainerApp in $workloadContainerApps) {
    if (-not $workloadContainerApp.exists) {
      continue
    }

    if ($workloadContainerApp.state.properties.runningStatus -ne 'Stopped') {
      Invoke-ContainerAppLifecycleAction -ResourceId $workloadContainerApp.resourceId -LifecycleAction 'stop'
      [void]$operations.Add("stopped-container-app:$($workloadContainerApp.role):$($workloadContainerApp.name)")

      if ($WaitForDesiredState) {
        $workloadContainerApp.state = Wait-ForContainerAppRunningState -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $resourceGroupName -ContainerAppName $workloadContainerApp.name -DesiredState 'Stopped'
      }
    }
  }
}

if ($Action -eq 'hibernate') {
  foreach ($alert in $alertRuleStates) {
    $state = Get-AlertRuleState $alert.resourceId
    if (-not $state -or $state.properties.enabled) { throw 'Alert suppression could not be verified. No endpoints were deleted.' }
  }
  Remove-DevPrivateConnectivity $privateConnectivity $workloadContainerApps $operations
}

if ($Action -eq 'resume') {
  if ($EnvironmentName -eq 'dev') {
    Restore-DevPrivateConnectivity $privateConnectivity $operations
  }
  foreach ($workloadContainerApp in $workloadContainerApps) {
    if (-not $workloadContainerApp.exists) {
      continue
    }

    if ($workloadContainerApp.state.properties.runningStatus -ne 'Running') {
      Invoke-ContainerAppLifecycleAction -ResourceId $workloadContainerApp.resourceId -LifecycleAction 'start'
      [void]$operations.Add("started-container-app:$($workloadContainerApp.role):$($workloadContainerApp.name)")

      if ($WaitForDesiredState) {
        $workloadContainerApp.state = Wait-ForContainerAppRunningState -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $resourceGroupName -ContainerAppName $workloadContainerApp.name -DesiredState 'Running'
      }
    }
  }

  if ($EnvironmentName -eq 'dev') {
    foreach ($app in $workloadContainerApps) {
      Wait-ForContainerAppReady $resolvedSubscriptionId $resourceGroupName $app.name
    }
    Wait-ForWorkloadHealth $containerAppState.properties.configuration.ingress.fqdn
    [void]$operations.Add('verified-web-bff-health')
  }

  if ($manageAlerts) {
    foreach ($alertRuleState in $alertRuleStates) {
      if ($alertRuleState.exists -and -not $alertRuleState.enabled) {
        Set-AlertRuleEnabledState -ResourceId $alertRuleState.resourceId -Enabled $true
        [void]$operations.Add("enabled-alert:$($alertRuleState.name)")
        $alertRuleState.enabled = $true
      }
    }
  }
  if ($EnvironmentName -eq 'dev') {
    foreach ($alert in $alertRuleStates) {
      $state = Get-AlertRuleState $alert.resourceId
      if (-not $state -or -not $state.properties.enabled) {
        throw 'Alert restoration could not be verified. Recovery remains incomplete; retry resume.'
      }
    }
    Set-WebHibernationMarker $resolvedSubscriptionId $resourceGroupName $false
  }
}

$latestContainerApps = foreach ($workloadContainerApp in $workloadContainerApps) {
  $latestState = if (-not $workloadContainerApp.exists) {
    $null
  } elseif ($Action -eq 'show-plan') {
    $workloadContainerApp.state
  } elseif ($WaitForDesiredState) {
    $workloadContainerApp.state
  } else {
    Get-ContainerAppState -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $resourceGroupName -ContainerAppName $workloadContainerApp.name
  }

  [pscustomobject]@{
    role = $workloadContainerApp.role
    name = $workloadContainerApp.name
    resourceId = $workloadContainerApp.resourceId
    exists = $workloadContainerApp.exists
    currentRunningStatus = if ($latestState) { [string]$latestState.properties.runningStatus } else { '' }
    desiredRunningStatus = if ($workloadContainerApp.exists) { $desiredRunningState } else { '' }
    ingressFqdn = if ($latestState) { [string]$latestState.properties.configuration.ingress.fqdn } else { '' }
    latestRevisionName = if ($latestState) { [string]$latestState.properties.latestRevisionName } else { '' }
    latestReadyRevisionName = if ($latestState) { [string]$latestState.properties.latestReadyRevisionName } else { '' }
  }
}

$latestWebContainerApp = @($latestContainerApps | Where-Object { $_.role -eq 'web' } | Select-Object -First 1)[0]
$latestBffContainerApp = @($latestContainerApps | Where-Object { $_.role -eq 'bff' } | Select-Object -First 1)[0]

[ordered]@{
  requestedAction = $requestedAction
  action = $Action
  environmentName = $EnvironmentName
  subscriptionId = $resolvedSubscriptionId
  platformSubscriptionId = $resolvedPlatformSubscriptionId
  resourceGroupName = $resourceGroupName
  containerAppName = $containerAppName
  containerAppResourceId = $containerAppResourceId
  currentRunningStatus = [string]$latestWebContainerApp.currentRunningStatus
  desiredRunningStatus = $desiredRunningState
  ingressFqdn = [string]$latestWebContainerApp.ingressFqdn
  latestRevisionName = [string]$latestWebContainerApp.latestRevisionName
  latestReadyRevisionName = [string]$latestWebContainerApp.latestReadyRevisionName
  bffContainerAppName = $bffContainerAppName
  bffContainerAppResourceId = $bffContainerAppResourceId
  bffExists = [bool]$latestBffContainerApp.exists
  bffCurrentRunningStatus = [string]$latestBffContainerApp.currentRunningStatus
  manageAlerts = $manageAlerts
  platformMonitorResourceGroupName = $platformMonitorResourceGroupName
  containerApps = [object[]]$latestContainerApps
  alertRules = $alertRuleStates
  privateEndpoints = @($privateConnectivity | Select-Object name, id, exists, ready)
  operations = [object[]]$operations.ToArray()
  costNote = 'Dev pause and hibernate stop apps, suppress alerts, and delete the two workload private endpoints; dev resume restores them through Bicep before starting apps. Explicit pause-apps retains endpoints. Key Vault, Redis (including its normal data TTLs), ACR, shared DNS, the ACA environment, and monitoring remain allocated and may still incur charges.'
} | ConvertTo-Json -Depth 6
