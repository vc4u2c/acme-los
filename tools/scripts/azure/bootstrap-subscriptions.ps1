[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet('show-plan', 'apply')]
  [string]$Mode = 'show-plan',

  [string]$PlatformConfigurationPath,
  [string]$GovernancePath,
  [string[]]$SubscriptionDisplayNames,
  [string]$BillingScope,
  [string]$BillingAccountName,
  [string]$BillingProfileName,
  [string]$InvoiceSectionName,
  [switch]$SkipManagementGroupPlacement,
  [ValidateSet('Production', 'DevTest')]
  [string]$Workload = 'Production'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $PlatformConfigurationPath) {
  $PlatformConfigurationPath = Join-Path $PSScriptRoot '..\..\..\infra\azure\config\platform.json'
}

if (-not $GovernancePath) {
  $GovernancePath = Join-Path $PSScriptRoot '..\..\..\infra\azure\config\governance.json'
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

function Write-Section {
  param([string]$Message)

  Write-Host
  Write-Host $Message -ForegroundColor Cyan
}

function Resolve-BillingScope {
  param(
    [string]$ExplicitBillingScope,
    [string]$ExplicitBillingAccountName,
    [string]$ExplicitBillingProfileName,
    [string]$ExplicitInvoiceSectionName
  )

  if ($ExplicitBillingScope) {
    return @{
      BillingScope = $ExplicitBillingScope
      BillingAccountName = $ExplicitBillingAccountName
      BillingProfileName = $ExplicitBillingProfileName
      InvoiceSectionName = $ExplicitInvoiceSectionName
    }
  }

  $billingAccounts = ConvertTo-ObjectArray (az billing account list --output json | ConvertFrom-Json)

  if ($ExplicitBillingAccountName) {
    $billingAccount = $billingAccounts | Where-Object { $_.name -eq $ExplicitBillingAccountName } | Select-Object -First 1
  } else {
    if (@($billingAccounts).Count -ne 1) {
      throw 'Unable to infer a single billing account. Pass -BillingAccountName or -BillingScope.'
    }

    $billingAccount = $billingAccounts[0]
  }

  if (-not $billingAccount) {
    throw 'Unable to resolve the billing account.'
  }

  $billingProfiles = ConvertTo-ObjectArray (az billing profile list --account-name $billingAccount.name --expand invoiceSections --output json | ConvertFrom-Json)

  if ($ExplicitBillingProfileName) {
    $billingProfile = $billingProfiles | Where-Object { $_.name -eq $ExplicitBillingProfileName } | Select-Object -First 1
  } else {
    if (@($billingProfiles).Count -ne 1) {
      throw 'Unable to infer a single billing profile. Pass -BillingProfileName or -BillingScope.'
    }

    $billingProfile = $billingProfiles[0]
  }

  if (-not $billingProfile) {
    throw 'Unable to resolve the billing profile.'
  }

  $invoiceSections = ConvertTo-ObjectArray $billingProfile.invoiceSections.value

  if ($ExplicitInvoiceSectionName) {
    $invoiceSection = $invoiceSections | Where-Object { $_.name -eq $ExplicitInvoiceSectionName } | Select-Object -First 1
  } else {
    if (@($invoiceSections).Count -ne 1) {
      throw 'Unable to infer a single invoice section. Pass -InvoiceSectionName or -BillingScope.'
    }

    $invoiceSection = $invoiceSections[0]
  }

  if (-not $invoiceSection) {
    throw 'Unable to resolve the invoice section.'
  }

  return @{
    BillingScope = $invoiceSection.id
    BillingAccountName = $billingAccount.name
    BillingProfileName = $billingProfile.name
    InvoiceSectionName = $invoiceSection.name
  }
}

function Get-TargetSubscriptions {
  param(
    $GovernanceConfiguration,
    [string[]]$RequestedDisplayNames
  )

  $targets = @($GovernanceConfiguration.subscriptionPlacement)

  if (-not $RequestedDisplayNames -or @($RequestedDisplayNames).Count -eq 0) {
    return $targets
  }

  return @(
    $targets | Where-Object { $RequestedDisplayNames -contains $_.displayName }
  )
}

function Get-ExistingSubscriptions {
  return ConvertTo-ObjectArray (az account subscription list --output json | ConvertFrom-Json)
}

function Get-ExistingAliases {
  $aliasesResponse = az account alias list --output json | ConvertFrom-Json
  if ($aliasesResponse.value) {
    return @($aliasesResponse.value)
  }

  return @()
}

function Get-ManagementGroupEntities {
  return ConvertTo-ObjectArray (az account management-group entities list --output json | ConvertFrom-Json)
}

function Get-SubscriptionEntityFromManagementGroups {
  param(
    [object[]]$Entities,
    [string]$SubscriptionId
  )

  return $Entities |
    Where-Object {
      $_.type -eq '/subscriptions' -and $_.name -eq $SubscriptionId
    } |
    Select-Object -First 1
}

function Get-ParentManagementGroupName {
  param([string]$ParentId)

  if (-not $ParentId) {
    return $null
  }

  return ($ParentId -split '/')[-1]
}

function Get-SubscriptionByDisplayName {
  param(
    [object[]]$ExistingSubscriptions,
    [string]$DisplayName
  )

  return $ExistingSubscriptions |
    Where-Object { $_.displayName -eq $DisplayName } |
    Select-Object -First 1
}

function Get-AliasName {
  param([string]$DisplayName)

  $normalizedName = $DisplayName.ToLowerInvariant() -replace '[^a-z0-9-]', '-'
  return "alias-$normalizedName"
}

function Get-AliasByName {
  param(
    [object[]]$ExistingAliases,
    [string]$AliasName
  )

  return $ExistingAliases |
    Where-Object { $_.name -eq $AliasName } |
    Select-Object -First 1
}

function Wait-ForAlias {
  param([string]$AliasName)

  az account alias wait --name $AliasName --created --interval 20 --timeout 3600 --output none
  return az account alias show --name $AliasName --output json | ConvertFrom-Json
}

function Ensure-Subscription {
  param(
    $TargetSubscription,
    [string]$ResolvedBillingScope,
    [string]$ResolvedWorkload,
    [object[]]$ExistingSubscriptions,
    [object[]]$ExistingAliases
  )

  $existingSubscription = Get-SubscriptionByDisplayName -ExistingSubscriptions $ExistingSubscriptions -DisplayName $TargetSubscription.displayName
  if ($existingSubscription) {
    return @{
      SubscriptionId = $existingSubscription.subscriptionId
      DisplayName = $existingSubscription.displayName
      AliasName = $null
      ProvisioningState = 'Existing'
    }
  }

  $aliasName = Get-AliasName -DisplayName $TargetSubscription.displayName
  $existingAlias = Get-AliasByName -ExistingAliases $ExistingAliases -AliasName $aliasName

  if (-not $existingAlias) {
    if ($PSCmdlet.ShouldProcess("Subscription '$($TargetSubscription.displayName)'", "Create via alias '$aliasName'")) {
      az account alias create `
        --name $aliasName `
        --billing-scope $ResolvedBillingScope `
        --display-name $TargetSubscription.displayName `
        --workload $ResolvedWorkload `
        --no-wait `
        --output none
    }
  }

  $alias = Wait-ForAlias -AliasName $aliasName
  $subscriptionId = $alias.properties.subscriptionId

  if (-not $subscriptionId) {
    throw "Alias '$aliasName' completed without a subscription id."
  }

  return @{
    SubscriptionId = $subscriptionId
    DisplayName = $TargetSubscription.displayName
    AliasName = $aliasName
    ProvisioningState = $alias.properties.provisioningState
  }
}

function Ensure-ManagementGroupPlacement {
  param(
    [string]$SubscriptionId,
    [string]$ManagementGroupName,
    [string]$ArmToken
  )

  $maxAttempts = 10

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $entities = Get-ManagementGroupEntities
    $subscriptionEntity = Get-SubscriptionEntityFromManagementGroups -Entities $entities -SubscriptionId $SubscriptionId
    $currentParentName = if ($subscriptionEntity -and $subscriptionEntity.parent) {
      Get-ParentManagementGroupName -ParentId $subscriptionEntity.parent.id
    } else {
      $null
    }

    if ($currentParentName -eq $ManagementGroupName) {
      return
    }

    if ($PSCmdlet.ShouldProcess("Subscription '$SubscriptionId'", "Assign to management group '$ManagementGroupName' (attempt $attempt of $maxAttempts)")) {
      $headers = @{
        Authorization = "Bearer $ArmToken"
        'Content-Type' = 'application/json'
      }

      Invoke-RestMethod `
        -Method Put `
        -Uri "https://management.azure.com/providers/Microsoft.Management/managementGroups/$ManagementGroupName/subscriptions/${SubscriptionId}?api-version=2020-05-01" `
        -Headers $headers `
        -Body '{}' | Out-Null
    }

    Start-Sleep -Seconds 15
  }

  throw "Subscription '$SubscriptionId' did not move to management group '$ManagementGroupName' after $maxAttempts attempts."
}

Test-RequiredCommand -Name 'az'

$platformConfiguration = Get-JsonFile -Path $PlatformConfigurationPath
$governanceConfiguration = Get-JsonFile -Path $GovernancePath
$billingContext = Resolve-BillingScope `
  -ExplicitBillingScope $BillingScope `
  -ExplicitBillingAccountName $BillingAccountName `
  -ExplicitBillingProfileName $BillingProfileName `
  -ExplicitInvoiceSectionName $InvoiceSectionName

$targetSubscriptions = Get-TargetSubscriptions -GovernanceConfiguration $governanceConfiguration -RequestedDisplayNames $SubscriptionDisplayNames
$existingSubscriptions = Get-ExistingSubscriptions
$existingAliases = Get-ExistingAliases
$armToken = az account get-access-token --resource-type arm --query accessToken -o tsv

if (-not $armToken) {
  throw 'Unable to acquire an Azure ARM access token.'
}

Write-Section 'Azure subscription bootstrap plan'
Write-Host "Billing scope: $($billingContext.BillingScope)"
Write-Host "Billing account: $($billingContext.BillingAccountName)"
Write-Host "Billing profile: $($billingContext.BillingProfileName)"
Write-Host "Invoice section: $($billingContext.InvoiceSectionName)"
Write-Host 'Target subscriptions:'

foreach ($targetSubscription in $targetSubscriptions) {
  $existingSubscription = Get-SubscriptionByDisplayName -ExistingSubscriptions $existingSubscriptions -DisplayName $targetSubscription.displayName
  $status = if ($existingSubscription) { "existing ($($existingSubscription.subscriptionId))" } else { 'missing' }
  Write-Host "  - $($targetSubscription.displayName) -> $($targetSubscription.managementGroup) [$status]"
}

if ($Mode -eq 'show-plan') {
  return
}

$results = @()

foreach ($targetSubscription in $targetSubscriptions) {
  $result = Ensure-Subscription `
    -TargetSubscription $targetSubscription `
    -ResolvedBillingScope $billingContext.BillingScope `
    -ResolvedWorkload $Workload `
    -ExistingSubscriptions $existingSubscriptions `
    -ExistingAliases $existingAliases

  if (-not $SkipManagementGroupPlacement.IsPresent) {
    Ensure-ManagementGroupPlacement `
      -SubscriptionId $result.SubscriptionId `
      -ManagementGroupName $targetSubscription.managementGroup `
      -ArmToken $armToken
  }

  $existingSubscriptions = Get-ExistingSubscriptions
  $existingAliases = Get-ExistingAliases

  $results += [pscustomobject]@{
    displayName = $result.DisplayName
    subscriptionId = $result.SubscriptionId
    aliasName = $result.AliasName
    provisioningState = $result.ProvisioningState
    managementGroup = $targetSubscription.managementGroup
  }
}

[ordered]@{
  billingScope = $billingContext.BillingScope
  workload = $Workload
  subscriptions = $results
} | ConvertTo-Json -Depth 5
