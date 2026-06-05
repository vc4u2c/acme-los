[CmdletBinding()]
param(
  [ValidateSet('dev')]
  [string]$EnvironmentName = 'dev',

  [string]$SubscriptionId,
  [string]$ConfigurationPath,
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

function Write-MockSmsOtp {
  param([string]$LogLine)

  if ($LogLine -notmatch 'okta\.telephony_hook\.mock_sms_delivered') {
    return
  }

  if ($Raw) {
    Write-Output $LogLine
    return
  }

  $jsonStart = $LogLine.IndexOf('{')
  if ($jsonStart -lt 0) {
    Write-Output $LogLine
    return
  }

  try {
    $record = $LogLine.Substring($jsonStart) | ConvertFrom-Json
  } catch {
    Write-Output $LogLine
    return
  }

  if ($record.event -ne 'okta.telephony_hook.mock_sms_delivered') {
    return
  }

  Write-Host ''
  Write-Host "[$($record.timestamp)] Mock Okta SMS OTP" -ForegroundColor Cyan
  Write-Host "phone: $($record.maskedPhoneNumber)"
  Write-Host "otp: $($record.mockOtpCode)" -ForegroundColor Yellow
  Write-Host "expires: $($record.otpExpires)"
  Write-Host "transaction: $($record.transactionId)"
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
Write-Host 'Trigger an Okta phone/SMS challenge, then copy the OTP printed below.'
Write-Host 'Press Ctrl+C to stop.'

az containerapp logs show `
  --resource-group $resourceGroupName `
  --name $containerAppName `
  --type console `
  --follow `
  --only-show-errors |
  ForEach-Object { Write-MockSmsOtp -LogLine ([string]$_) }
