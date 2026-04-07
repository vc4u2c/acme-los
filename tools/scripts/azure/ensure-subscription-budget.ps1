[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$GovernancePath,
  [string]$BudgetName,
  [decimal]$Amount,
  [string]$SubscriptionId,
  [string]$SubscriptionDisplayName,
  [string[]]$ContactEmails,
  [switch]$AllConfiguredBudgets,
  [string]$Locale = 'en-us',
  [datetime]$StartDate = (Get-Date -Year (Get-Date).Year -Month (Get-Date).Month -Day 1),
  [datetime]$EndDate = (Get-Date -Year ((Get-Date).Year + 5) -Month 12 -Day 31)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $GovernancePath) {
  $GovernancePath = Join-Path $PSScriptRoot '..\..\..\infra\azure\config\governance.json'
}

function Test-RequiredCommand {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

Test-RequiredCommand -Name 'az'

$armToken = az account get-access-token --resource-type arm --query accessToken -o tsv
if (-not $armToken) {
  throw 'Unable to acquire an Azure ARM access token.'
}

$governance = Get-Content -Raw -Path $GovernancePath | ConvertFrom-Json
$defaultBudget = $governance.costGuardrails.defaultSubscriptionBudget
$configuredBudgets = @()

if ($governance.costGuardrails.PSObject.Properties.Name -contains 'subscriptionBudgets') {
  $configuredBudgets = @($governance.costGuardrails.subscriptionBudgets)
} elseif ($governance.costGuardrails.PSObject.Properties.Name -contains 'subscriptionBudget') {
  $configuredBudgets = @($governance.costGuardrails.subscriptionBudget)
}

if ($configuredBudgets.Count -eq 0) {
  throw 'No subscription budgets were defined in governance.json.'
}

function Resolve-ConfiguredBudget {
  param(
    [object[]]$Budgets,
    [string]$ByBudgetName,
    [string]$BySubscriptionDisplayName,
    [string]$BySubscriptionId
  )

  $matches = @($Budgets)

  if ($ByBudgetName) {
    $matches = @($matches | Where-Object { $_.name -eq $ByBudgetName })
  }

  if ($BySubscriptionDisplayName) {
    $matches = @($matches | Where-Object { $_.subscriptionDisplayName -eq $BySubscriptionDisplayName })
  }

  if ($BySubscriptionId) {
    $matches = @($matches | Where-Object { $_.subscriptionId -eq $BySubscriptionId })
  }

  return $matches
}

$account = az account show --output json | ConvertFrom-Json

if (-not $ContactEmails -or $ContactEmails.Count -eq 0) {
  if ($account.user.type -eq 'user' -and $account.user.name) {
    $ContactEmails = @($account.user.name)
  } else {
    throw 'No contact email was provided and the signed-in Azure account did not expose a user email.'
  }
}

$budgetsToApply = @()

if ($AllConfiguredBudgets) {
  $budgetsToApply = @($configuredBudgets)
} else {
  $resolvedSubscriptionId = if ($SubscriptionId) { $SubscriptionId } else { $account.id }
  $resolvedSubscriptionDisplayName = if ($SubscriptionDisplayName) { $SubscriptionDisplayName } else { $account.name }
  $budgetMatches = Resolve-ConfiguredBudget `
    -Budgets $configuredBudgets `
    -ByBudgetName $BudgetName `
    -BySubscriptionDisplayName $resolvedSubscriptionDisplayName `
    -BySubscriptionId $resolvedSubscriptionId

  if ($budgetMatches.Count -eq 0) {
    throw "No configured budget matched BudgetName='$BudgetName', SubscriptionDisplayName='$resolvedSubscriptionDisplayName', SubscriptionId='$resolvedSubscriptionId'."
  }

  if ($budgetMatches.Count -gt 1) {
    throw "More than one configured budget matched the provided selectors. Please pass -BudgetName or -SubscriptionDisplayName explicitly."
  }

  $budgetsToApply = @($budgetMatches[0])
}

function Resolve-SubscriptionIdByDisplayName {
  param([string]$DisplayName)

  $subscriptions = az account subscription list --output json | ConvertFrom-Json
  $match = @($subscriptions | Where-Object { $_.displayName -eq $DisplayName })

  if ($match.Count -eq 1) {
    return $match[0].subscriptionId
  }

  if ($match.Count -gt 1) {
    throw "More than one subscription matched display name '$DisplayName'."
  }

  $entities = az account management-group entities list --output json | ConvertFrom-Json
  $entityMatch = @(
    $entities |
      Where-Object {
        $_.type -eq '/subscriptions' -and $_.displayName -eq $DisplayName
      }
  )

  if ($entityMatch.Count -eq 1) {
    return $entityMatch[0].name
  }

  if ($entityMatch.Count -gt 1) {
    throw "More than one management-group subscription entity matched display name '$DisplayName'."
  }

  throw "Unable to resolve subscription id for '$DisplayName'."
}

function Get-OptionalPropertyValue {
  param(
    [object]$InputObject,
    [string]$PropertyName
  )

  if (-not $InputObject) {
    return $null
  }

  if ($InputObject.PSObject.Properties.Name -contains $PropertyName) {
    return $InputObject.$PropertyName
  }

  return $null
}

$results = @()

foreach ($budget in $budgetsToApply) {
  $budgetNameToApply = if ($BudgetName -and -not $AllConfiguredBudgets) { $BudgetName } else { $budget.name }
  $amountToApply = if ($PSBoundParameters.ContainsKey('Amount') -and -not $AllConfiguredBudgets) { $Amount } else { [decimal]$budget.amount }
  $budgetTimeGrain = Get-OptionalPropertyValue -InputObject $budget -PropertyName 'timeGrain'
  $defaultTimeGrain = Get-OptionalPropertyValue -InputObject $defaultBudget -PropertyName 'timeGrain'
  $budgetActualThresholds = Get-OptionalPropertyValue -InputObject $budget -PropertyName 'actualThresholds'
  $budgetForecastThresholds = Get-OptionalPropertyValue -InputObject $budget -PropertyName 'forecastThresholds'
  $defaultActualThresholds = Get-OptionalPropertyValue -InputObject $defaultBudget -PropertyName 'actualThresholds'
  $defaultForecastThresholds = Get-OptionalPropertyValue -InputObject $defaultBudget -PropertyName 'forecastThresholds'
  $budgetSubscriptionId = Get-OptionalPropertyValue -InputObject $budget -PropertyName 'subscriptionId'
  $budgetSubscriptionDisplayName = Get-OptionalPropertyValue -InputObject $budget -PropertyName 'subscriptionDisplayName'

  $timeGrain = if ($budgetTimeGrain) { $budgetTimeGrain } elseif ($defaultTimeGrain) { $defaultTimeGrain } else { 'Monthly' }
  $actualThresholds = if ($budgetActualThresholds) { @($budgetActualThresholds) } else { @($defaultActualThresholds) }
  $forecastThresholds = if ($budgetForecastThresholds) { @($budgetForecastThresholds) } else { @($defaultForecastThresholds) }
  $resolvedBudgetSubscriptionId = if ($SubscriptionId -and -not $AllConfiguredBudgets) {
    $SubscriptionId
  } elseif ($budgetSubscriptionId) {
    $budgetSubscriptionId
  } elseif ($budgetSubscriptionDisplayName) {
    Resolve-SubscriptionIdByDisplayName -DisplayName $budgetSubscriptionDisplayName
  } else {
    $account.id
  }

  $notifications = @{}

  foreach ($threshold in $actualThresholds) {
    $notifications["Actual_${threshold}_Percent"] = @{
      enabled = $true
      operator = 'GreaterThan'
      threshold = [int]$threshold
      thresholdType = 'Actual'
      contactEmails = $ContactEmails
      contactRoles = @('Owner')
      contactGroups = @()
      locale = $Locale
    }
  }

  foreach ($threshold in $forecastThresholds) {
    $notifications["Forecast_${threshold}_Percent"] = @{
      enabled = $true
      operator = 'GreaterThan'
      threshold = [int]$threshold
      thresholdType = 'Forecasted'
      contactEmails = $ContactEmails
      contactRoles = @('Owner')
      contactGroups = @()
      locale = $Locale
    }
  }

  $body = @{
    properties = @{
      amount = $amountToApply
      category = 'Cost'
      timeGrain = $timeGrain
      timePeriod = @{
        startDate = $StartDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        endDate = $EndDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      }
      notifications = $notifications
    }
  }

  $payloadPath = Join-Path $env:TEMP "$budgetNameToApply.budget.json"
  $response = $null
  $body | ConvertTo-Json -Depth 10 | Set-Content -Path $payloadPath -Encoding utf8

  try {
    if ($PSCmdlet.ShouldProcess("Subscription '$resolvedBudgetSubscriptionId'", "Create or update budget '$budgetNameToApply'")) {
      $headers = @{
        Authorization = "Bearer $armToken"
        'Content-Type' = 'application/json'
      }
      $payload = Get-Content -Raw -Path $payloadPath
      $response = Invoke-RestMethod `
        -Method Put `
        -Uri "https://management.azure.com/subscriptions/$resolvedBudgetSubscriptionId/providers/Microsoft.Consumption/budgets/${budgetNameToApply}?api-version=2024-08-01" `
        -Headers $headers `
        -Body $payload
    }
  } finally {
    Remove-Item -Force $payloadPath -ErrorAction SilentlyContinue
  }

  $results += [ordered]@{
    budgetName = if ($response) { $response.name } else { $budgetNameToApply }
    subscriptionId = $resolvedBudgetSubscriptionId
    subscriptionDisplayName = if ($budgetSubscriptionDisplayName) { $budgetSubscriptionDisplayName } else { $resolvedSubscriptionDisplayName }
    amount = if ($response) { $response.properties.amount } else { $amountToApply }
    timeGrain = if ($response) { $response.properties.timeGrain } else { $timeGrain }
    startDate = if ($response) { $response.properties.timePeriod.startDate } else { $StartDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
    endDate = if ($response) { $response.properties.timePeriod.endDate } else { $EndDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
    contactEmails = $ContactEmails
  }
}

$results | ConvertTo-Json -Depth 6
