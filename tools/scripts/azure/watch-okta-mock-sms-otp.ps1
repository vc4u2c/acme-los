[CmdletBinding()]
param(
  [ValidateSet('dev')]
  [string]$EnvironmentName = 'dev',

  [string]$SubscriptionId,
  [string]$ConfigurationPath,
  [ValidateRange(100, 5000)]
  [int]$PollMilliseconds = 250,
  [string]$BaseUrl,
  [string]$Authorization = $env:ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION,
  [string]$AuthorizationFile = $env:ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION_FILE,
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

function Read-SecretTextFile {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }

  $value = (Get-Content -Raw -LiteralPath $Path).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $null
  }

  return $value
}

function Resolve-HookAuthorization {
  param(
    [string]$Authorization,
    [string]$AuthorizationFile
  )

  if (-not [string]::IsNullOrWhiteSpace($Authorization)) {
    return $Authorization.Trim()
  }

  $candidateFiles = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($AuthorizationFile)) {
    [void]$candidateFiles.Add($AuthorizationFile)
  }

  foreach ($candidateFile in $candidateFiles) {
    $value = Read-SecretTextFile -Path $candidateFile
    if ($value) {
      Write-Host "Using Okta telephony hook authorization from '$candidateFile'."
      return $value
    }
  }

  throw 'Set -Authorization, ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION, -AuthorizationFile, or ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION_FILE to the Okta telephony hook shared authorization value.'
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

function Get-ContainerAppBaseUrl {
  param(
    [string]$ResourceGroupName,
    [string]$ContainerAppName
  )

  $fqdn = [string](az containerapp show `
      --resource-group $ResourceGroupName `
      --name $ContainerAppName `
      --query properties.configuration.ingress.fqdn `
      --output tsv `
      --only-show-errors)

  if ([string]::IsNullOrWhiteSpace($fqdn)) {
    throw "Unable to resolve ingress FQDN for container app '$ContainerAppName'."
  }

  return "https://$fqdn"
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

function Invoke-MockSmsInboxRequest {
  param(
    [string]$BaseUrl,
    [string]$Authorization
  )

  $normalizedBaseUrl = $BaseUrl.TrimEnd('/')
  $uri = "$normalizedBaseUrl/api/hooks/okta/telephony"
  $headers = @{
    Authorization = $Authorization
    Accept = 'application/json'
  }

  try {
    return Invoke-RestMethod `
      -Method Get `
      -Uri $uri `
      -Headers $headers `
      -TimeoutSec 5
  } catch {
    $response = $_.Exception.Response
    $statusCode = if ($response) { [int]$response.StatusCode } else { $null }

    if ($statusCode -eq 405) {
      throw 'The deployed web app does not expose the direct mock SMS OTP inbox yet. Deploy the latest web app revision before using this watcher.'
    }

    if ($statusCode -eq 401) {
      throw 'The mock SMS OTP inbox rejected the authorization value. Confirm the local authorization file matches the deployed ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION secret.'
    }

    if ($statusCode -eq 404) {
      throw 'The mock SMS OTP inbox is not available. Confirm dev is deployed with ACME_OKTA_TELEPHONY_PROVIDER=mock and ACME_ENABLE_MOCK_SMS_OTP=true.'
    }

    throw
  }
}

function Watch-MockSmsOtpFromDirectInbox {
  param(
    [string]$BaseUrl,
    [string]$Authorization,
    [int]$PollMilliseconds,
    [switch]$Once
  )

  $seen = @{}

  while ($true) {
    $payload = Invoke-MockSmsInboxRequest -BaseUrl $BaseUrl -Authorization $Authorization
    $record = Get-ObjectPropertyValue -InputObject $payload -Names @('record')

    if ($record) {
      $key = Get-MockSmsRecordKey -Record $record
      if ($key -and -not $seen.ContainsKey($key)) {
        $seen[$key] = $true
        Write-MockSmsRecord -Record $record
      }
    } elseif ($Once) {
      Write-Host 'No mock SMS OTP is currently available.'
    }

    if ($Once) {
      break
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  Test-RequiredCommand -Name 'az'

  $configuration = Get-JsonFile -Path $ConfigurationPath
  if (-not $SubscriptionId) {
    $SubscriptionId = Resolve-EnvironmentSubscriptionId -Configuration $configuration -EnvironmentName $EnvironmentName
  }

  $resourceGroupName = Get-WorkloadResourceGroupName -Configuration $configuration -EnvironmentName $EnvironmentName
  $containerAppName = Get-ContainerAppName -Configuration $configuration -EnvironmentName $EnvironmentName

  az account set --subscription $SubscriptionId --only-show-errors

  $BaseUrl = Get-ContainerAppBaseUrl -ResourceGroupName $resourceGroupName -ContainerAppName $containerAppName
  Write-Host "Watching mock Okta SMS OTP records for '$containerAppName' in '$resourceGroupName'."
} else {
  Write-Host "Watching mock Okta SMS OTP records for '$($BaseUrl.TrimEnd('/'))'."
}

Write-Host "Direct endpoint: $($BaseUrl.TrimEnd('/'))/api/hooks/okta/telephony."
Write-Host "Poll interval: $PollMilliseconds milliseconds."
Write-Host 'Trigger an Okta phone/SMS challenge, then copy the OTP printed below.'
Write-Host 'Press Ctrl+C to stop.'

$Authorization = Resolve-HookAuthorization -Authorization $Authorization -AuthorizationFile $AuthorizationFile

try {
  Watch-MockSmsOtpFromDirectInbox `
    -BaseUrl $BaseUrl `
    -Authorization $Authorization `
    -PollMilliseconds $PollMilliseconds `
    -Once:$Once
} catch {
  Write-Host ''
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
