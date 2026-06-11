[CmdletBinding()]
param(
  [ValidateSet('dev')]
  [string]$EnvironmentName = 'dev',

  [string]$SubscriptionId,
  [string]$ConfigurationPath,
  [ValidateSet('LogAnalytics', 'Console')]
  [string]$Source = 'LogAnalytics',
  [ValidateRange(5, 3600)]
  [int]$LookbackSeconds = 30,
  [int]$PollSeconds = 3,
  [switch]$Once,
  [switch]$Raw
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

function Get-ObjectPropertyValue {
  param(
    $InputObject,
    [string[]]$Names
  )

  if ($null -eq $InputObject) {
    return $null
  }

  foreach ($name in $Names) {
    $property = $InputObject.PSObject.Properties[$name]
    if ($property) {
      return $property.Value
    }
  }

  return $null
}

function ConvertFrom-JsonText {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  $jsonStart = $Text.IndexOf('{')
  if ($jsonStart -lt 0) {
    return $null
  }

  try {
    return $Text.Substring($jsonStart) | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Find-MockSmsRecord {
  param(
    $InputObject,
    [int]$Depth = 0
  )

  if ($null -eq $InputObject -or $Depth -gt 4) {
    return $null
  }

  if ($InputObject -is [string]) {
    if ($InputObject -notmatch 'okta\.telephony_hook\.mock_sms_delivered') {
      return $null
    }

    $parsed = ConvertFrom-JsonText -Text $InputObject
    if ($null -eq $parsed) {
      return $null
    }

    return Find-MockSmsRecord -InputObject $parsed -Depth ($Depth + 1)
  }

  $eventName = Get-ObjectPropertyValue -InputObject $InputObject -Names @('event', 'eventName')
  if ($eventName -eq 'okta.telephony_hook.mock_sms_delivered') {
    return $InputObject
  }

  foreach ($propertyName in @('log', 'Log', 'Log_s', 'message', 'Message', 'Message_s', 'msg', 'text', 'value', 'Value')) {
    $value = Get-ObjectPropertyValue -InputObject $InputObject -Names @($propertyName)
    if ($value -is [string] -and $value -match 'okta\.telephony_hook\.mock_sms_delivered') {
      $record = Find-MockSmsRecord -InputObject $value -Depth ($Depth + 1)
      if ($record) {
        return $record
      }
    }
  }

  foreach ($propertyName in @('properties', 'Properties', 'data', 'Data')) {
    $value = Get-ObjectPropertyValue -InputObject $InputObject -Names @($propertyName)
    $record = Find-MockSmsRecord -InputObject $value -Depth ($Depth + 1)
    if ($record) {
      return $record
    }
  }

  return $null
}

function Resolve-SubscriptionIdByDisplayName {
  param([string]$DisplayName)

  $subscriptions = ConvertTo-ObjectArray (az account subscription list --output json --only-show-errors | ConvertFrom-Json)
  $subscription = @(
    $subscriptions |
      Where-Object { $_.displayName -eq $DisplayName } |
      Select-Object -First 1
  )

  if ($subscription.Count -gt 0 -and $subscription[0]) {
    return [string]$subscription[0].subscriptionId
  }

  throw "Unable to resolve subscription '$DisplayName'."
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

  return Resolve-SubscriptionIdByDisplayName -DisplayName $targetDisplayName
}

function Resolve-PlatformSubscriptionId {
  param($Configuration)

  return Resolve-SubscriptionIdByDisplayName -DisplayName $Configuration.subscriptions.platform
}

function Get-PlatformMonitorResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.monitorResourceGroupName
}

function Get-LogAnalyticsWorkspaceName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "log-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-LogAnalyticsWorkspaceCustomerId {
  param(
    [string]$PlatformSubscriptionId,
    [string]$PlatformMonitorResourceGroupName,
    [string]$WorkspaceName
  )

  return [string](az monitor log-analytics workspace show `
      --subscription $PlatformSubscriptionId `
      --resource-group $PlatformMonitorResourceGroupName `
      --workspace-name $WorkspaceName `
      --query customerId `
      --output tsv `
      --only-show-errors)
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

function Get-MockSmsRecordKey {
  param($Record)

  foreach ($propertyName in @('transactionId', 'eventId', 'timestamp')) {
    $value = Get-ObjectPropertyValue -InputObject $Record -Names @($propertyName)
    if ($value) {
      return [string]$value
    }
  }

  return ($Record | ConvertTo-Json -Compress)
}

function Get-MockSmsRecordUtcTime {
  param(
    $Record,
    $FallbackTime
  )

  foreach ($propertyName in @('timestamp', 'time', 'timeStamp')) {
    $value = Get-ObjectPropertyValue -InputObject $Record -Names @($propertyName)
    if ($value) {
      try {
        return [DateTimeOffset]::Parse([string]$value).UtcDateTime
      } catch {
      }
    }
  }

  if ($FallbackTime) {
    try {
      return [DateTimeOffset]::Parse([string]$FallbackTime).UtcDateTime
    } catch {
    }
  }

  return $null
}

function Write-MockSmsRecord {
  param($Record)

  if ($Raw) {
    Write-Output ($Record | ConvertTo-Json -Compress)
    return
  }

  $timestamp = Get-ObjectPropertyValue -InputObject $Record -Names @('timestamp', 'time', 'timeStamp')
  $maskedPhoneNumber = Get-ObjectPropertyValue -InputObject $Record -Names @('maskedPhoneNumber', 'phone')
  $mockOtpCode = Get-ObjectPropertyValue -InputObject $Record -Names @('mockOtpCode', 'otpCode')
  $otpExpires = Get-ObjectPropertyValue -InputObject $Record -Names @('otpExpires', 'expires')
  $transactionId = Get-ObjectPropertyValue -InputObject $Record -Names @('transactionId', 'eventId')

  Write-Host ''
  Write-Host "[$timestamp] Mock Okta SMS OTP" -ForegroundColor Cyan
  Write-Host "phone: $maskedPhoneNumber"
  Write-Host "otp: $mockOtpCode" -ForegroundColor Yellow
  Write-Host "expires: $otpExpires"
  Write-Host "transaction: $transactionId"
}

function Write-MockSmsOtp {
  param([string]$LogLine)

  if ($LogLine -notmatch 'okta\.telephony_hook\.mock_sms_delivered') {
    return
  }

  if ($Raw) {
    Write-Output $LogLine
    return
  }

  $record = Find-MockSmsRecord -InputObject $LogLine
  if ($null -eq $record) {
    return
  }

  Write-MockSmsRecord -Record $record
}

function Watch-MockSmsOtpFromConsole {
  param(
    [string]$ResourceGroupName,
    [string]$ContainerAppName,
    [switch]$Once
  )

  $arguments = @(
    'containerapp', 'logs', 'show',
    '--resource-group', $ResourceGroupName,
    '--name', $ContainerAppName,
    '--type', 'console',
    '--tail', '300',
    '--only-show-errors'
  )

  if (-not $Once) {
    $arguments += '--follow'
  }

  az @arguments |
    ForEach-Object { Write-MockSmsOtp -LogLine ([string]$_) }
}

function Watch-MockSmsOtpFromLogAnalytics {
  param(
    [string]$WorkspaceCustomerId,
    [string]$ContainerAppName,
    [int]$LookbackSeconds,
    [int]$PollSeconds,
    [switch]$Once
  )

  $seen = @{}

  while ($true) {
    $queryStartedUtc = (Get-Date).ToUniversalTime()
    $cutoffUtc = $queryStartedUtc.AddSeconds(-1 * $LookbackSeconds)
    $queryLookbackSeconds = [Math]::Max($LookbackSeconds + 120, $LookbackSeconds * 4)

    $query = @"
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(${queryLookbackSeconds}s)
| where ContainerAppName_s == '$ContainerAppName'
| where Log_s has 'okta.telephony_hook.mock_sms_delivered'
| project TimeGenerated, Log_s
| order by TimeGenerated desc
| take 50
"@

    $rows = ConvertTo-ObjectArray (az monitor log-analytics query `
        --workspace $WorkspaceCustomerId `
        --analytics-query $query `
        --output json `
        --only-show-errors | ConvertFrom-Json)

    $records = foreach ($row in $rows) {
      $rowTime = Get-ObjectPropertyValue -InputObject $row -Names @('TimeGenerated', 'time_t')
      $logLine = Get-ObjectPropertyValue -InputObject $row -Names @('Log_s', 'Log')
      $record = Find-MockSmsRecord -InputObject $logLine
      if ($null -eq $record) {
        continue
      }

      $recordTime = Get-MockSmsRecordUtcTime -Record $record -FallbackTime $rowTime
      if ($null -eq $recordTime -or $recordTime -lt $cutoffUtc) {
        continue
      }

      [pscustomobject]@{
        Key = Get-MockSmsRecordKey -Record $record
        Record = $record
        Time = $recordTime
      }
    }

    $records = if ($Once) {
      @($records | Sort-Object Time -Descending | Select-Object -First 1)
    } else {
      @($records | Sort-Object Time)
    }

    foreach ($row in $records) {
      $key = $row.Key
      if (-not $key -or $seen.ContainsKey($key)) {
        continue
      }

      $seen[$key] = $true
      Write-MockSmsRecord -Record $row.Record
    }

    if ($Once) {
      break
    }

    Start-Sleep -Seconds $PollSeconds
  }
}

Test-RequiredCommand -Name 'az'

$configuration = Get-JsonFile -Path $ConfigurationPath
if (-not $SubscriptionId) {
  $SubscriptionId = Resolve-EnvironmentSubscriptionId -Configuration $configuration -EnvironmentName $EnvironmentName
}

$resourceGroupName = Get-WorkloadResourceGroupName -Configuration $configuration -EnvironmentName $EnvironmentName
$containerAppName = Get-ContainerAppName -Configuration $configuration -EnvironmentName $EnvironmentName

az account set --subscription $SubscriptionId --only-show-errors

Write-Host "Watching mock Okta SMS OTP logs for '$containerAppName' in '$resourceGroupName'."
Write-Host "Source: $Source."
Write-Host "Lookback: $LookbackSeconds seconds."
Write-Host 'Trigger an Okta phone/SMS challenge, then copy the OTP printed below.'
Write-Host 'Press Ctrl+C to stop.'

if ($Source -eq 'Console') {
  Watch-MockSmsOtpFromConsole `
    -ResourceGroupName $resourceGroupName `
    -ContainerAppName $containerAppName `
    -Once:$Once
} else {
  $platformSubscriptionId = Resolve-PlatformSubscriptionId -Configuration $configuration
  $platformMonitorResourceGroupName = Get-PlatformMonitorResourceGroupName -Configuration $configuration
  $workspaceName = Get-LogAnalyticsWorkspaceName -Configuration $configuration -EnvironmentName $EnvironmentName
  $workspaceCustomerId = Get-LogAnalyticsWorkspaceCustomerId `
    -PlatformSubscriptionId $platformSubscriptionId `
    -PlatformMonitorResourceGroupName $platformMonitorResourceGroupName `
    -WorkspaceName $workspaceName

  Write-Host "Workspace: $workspaceName."
  Watch-MockSmsOtpFromLogAnalytics `
    -WorkspaceCustomerId $workspaceCustomerId `
    -ContainerAppName $containerAppName `
    -LookbackSeconds $LookbackSeconds `
    -PollSeconds $PollSeconds `
    -Once:$Once
}
