[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet('show-plan', 'apply')]
  [string]$Mode = 'show-plan',

  [string]$PlatformConfigurationPath,
  [string]$GovernancePath,
  [string]$LegacyManagementGroupName = 'mg-vc4u2c-demo',
  [switch]$RemoveEmptyLegacyManagementGroup
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

function Resolve-TenantId {
  $account = az account show --output json | ConvertFrom-Json
  return $account.tenantId
}

function Get-ManagementGroupDefinitions {
  param(
    $PlatformConfiguration,
    $GovernanceConfiguration
  )

  $rootName = $GovernanceConfiguration.managementGroupHierarchy.root
  $landingZonesName = $GovernanceConfiguration.managementGroupHierarchy.landingZones

  return @(
    [pscustomobject]@{
      Name = $rootName
      DisplayName = $PlatformConfiguration.organizationName
      ParentName = $null
      Purpose = 'Organizational root management group'
    },
    [pscustomobject]@{
      Name = $GovernanceConfiguration.managementGroupHierarchy.platform
      DisplayName = "$($PlatformConfiguration.organizationName) Platform"
      ParentName = $rootName
      Purpose = 'Shared platform and governance subscriptions'
    },
    [pscustomobject]@{
      Name = $landingZonesName
      DisplayName = "$($PlatformConfiguration.organizationName) Landing Zones"
      ParentName = $rootName
      Purpose = 'Landing-zone parent for workload archetypes'
    },
    [pscustomobject]@{
      Name = $GovernanceConfiguration.managementGroupHierarchy.online
      DisplayName = "$($PlatformConfiguration.organizationName) Online"
      ParentName = $landingZonesName
      Purpose = 'Online workloads such as ACME LOS'
    },
    [pscustomobject]@{
      Name = $GovernanceConfiguration.managementGroupHierarchy.sandbox
      DisplayName = "$($PlatformConfiguration.organizationName) Sandbox"
      ParentName = $landingZonesName
      Purpose = 'Ephemeral sandbox and ADE workloads'
    }
  )
}

function Get-ExistingManagementGroups {
  return ConvertTo-ObjectArray (az account management-group list --output json | ConvertFrom-Json)
}

function Get-ExistingEntities {
  return ConvertTo-ObjectArray (az account management-group entities list --output json | ConvertFrom-Json)
}

function Get-ExistingSubscriptions {
  return ConvertTo-ObjectArray (az account subscription list --output json | ConvertFrom-Json)
}

function Get-ManagementGroupEntity {
  param(
    [object[]]$Entities,
    [string]$ManagementGroupName
  )

  return $Entities |
    Where-Object {
      $_.type -eq 'Microsoft.Management/managementGroups' -and $_.name -eq $ManagementGroupName
    } |
    Select-Object -First 1
}

function Get-SubscriptionEntity {
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

function Get-ParentManagementGroupNameFromId {
  param([string]$ParentId)

  if (-not $ParentId) {
    return $null
  }

  return ($ParentId -split '/')[-1]
}

function Ensure-ManagementGroup {
  param(
    [pscustomobject]$Definition,
    [object[]]$ExistingManagementGroups,
    [object[]]$ExistingEntities
  )

  $existingManagementGroup = $ExistingManagementGroups |
    Where-Object { $_.name -eq $Definition.Name } |
    Select-Object -First 1

  if (-not $existingManagementGroup) {
    if ($PSCmdlet.ShouldProcess("Management group '$($Definition.Name)'", 'Create')) {
      if ($Definition.ParentName) {
        az account management-group create `
          --name $Definition.Name `
          --display-name $Definition.DisplayName `
          --parent $Definition.ParentName `
          --output none
      } else {
        az account management-group create `
          --name $Definition.Name `
          --display-name $Definition.DisplayName `
          --output none
      }
    }

    return
  }

  $existingEntity = Get-ManagementGroupEntity -Entities $ExistingEntities -ManagementGroupName $Definition.Name
  $existingParentName = if ($existingEntity -and $existingEntity.parent) {
    Get-ParentManagementGroupNameFromId -ParentId $existingEntity.parent.id
  } else {
    $null
  }

  $displayNameNeedsUpdate = $existingManagementGroup.displayName -ne $Definition.DisplayName
  $parentNeedsUpdate = $existingParentName -ne $Definition.ParentName

  if (-not ($displayNameNeedsUpdate -or $parentNeedsUpdate)) {
    return
  }

  if ($PSCmdlet.ShouldProcess("Management group '$($Definition.Name)'", 'Update')) {
    $command = @(
      'account', 'management-group', 'update',
      '--name', $Definition.Name,
      '--display-name', $Definition.DisplayName
    )

    if ($Definition.ParentName) {
      $command += @('--parent', $Definition.ParentName)
    }

    az @command --output none
  }
}

function Ensure-SubscriptionPlacement {
  param(
    [string]$SubscriptionId,
    [string]$TargetManagementGroupName,
    [object[]]$ExistingEntities,
    [string]$ArmToken
  )

  $subscriptionEntity = Get-SubscriptionEntity -Entities $ExistingEntities -SubscriptionId $SubscriptionId
  $currentParentName = if ($subscriptionEntity -and $subscriptionEntity.parent) {
    Get-ParentManagementGroupNameFromId -ParentId $subscriptionEntity.parent.id
  } else {
    $null
  }

  if ($currentParentName -eq $TargetManagementGroupName) {
    return
  }

  if ($PSCmdlet.ShouldProcess("Subscription '$SubscriptionId'", "Move to management group '$TargetManagementGroupName'")) {
    $headers = @{
      Authorization = "Bearer $ArmToken"
      'Content-Type' = 'application/json'
    }

    Invoke-RestMethod `
      -Method Put `
      -Uri "https://management.azure.com/providers/Microsoft.Management/managementGroups/$TargetManagementGroupName/subscriptions/$SubscriptionId?api-version=2020-05-01" `
      -Headers $headers `
      -Body '{}' | Out-Null
  }
}

function Get-ConfiguredSubscriptionPlacementState {
  param(
    [object[]]$SubscriptionPlacements,
    [object[]]$ExistingSubscriptions,
    [object[]]$ExistingEntities
  )

  $states = @()

  foreach ($placement in $SubscriptionPlacements) {
    $subscription = $ExistingSubscriptions |
      Where-Object { $_.displayName -eq $placement.displayName } |
      Select-Object -First 1

    $subscriptionId = if ($subscription) { $subscription.subscriptionId } else { $null }
    $subscriptionEntity = if ($subscriptionId) {
      Get-SubscriptionEntity -Entities $ExistingEntities -SubscriptionId $subscriptionId
    } else {
      $null
    }
    $currentParentName = if ($subscriptionEntity -and $subscriptionEntity.parent) {
      Get-ParentManagementGroupNameFromId -ParentId $subscriptionEntity.parent.id
    } else {
      $null
    }

    $states += [pscustomobject]@{
      DisplayName = $placement.displayName
      SubscriptionId = $subscriptionId
      CurrentManagementGroup = $currentParentName
      TargetManagementGroup = $placement.managementGroup
      Exists = [bool]$subscription
    }
  }

  return $states
}

function Remove-EmptyManagementGroup {
  param(
    [string]$ManagementGroupName,
    [object[]]$ExistingEntities
  )

  $managementGroupEntity = Get-ManagementGroupEntity -Entities $ExistingEntities -ManagementGroupName $ManagementGroupName

  if (-not $managementGroupEntity) {
    return
  }

  if (($managementGroupEntity.numberOfChildren -gt 0) -or ($managementGroupEntity.numberOfChildGroups -gt 0)) {
    return
  }

  if ($PSCmdlet.ShouldProcess("Management group '$ManagementGroupName'", 'Delete empty legacy management group')) {
    az account management-group delete --name $ManagementGroupName --yes --output none
  }
}

Test-RequiredCommand -Name 'az'

$platformConfiguration = Get-JsonFile -Path $PlatformConfigurationPath
$governanceConfiguration = Get-JsonFile -Path $GovernancePath
$tenantId = Resolve-TenantId
$managementGroupDefinitions = Get-ManagementGroupDefinitions -PlatformConfiguration $platformConfiguration -GovernanceConfiguration $governanceConfiguration
$existingManagementGroups = Get-ExistingManagementGroups
$existingEntities = Get-ExistingEntities
$existingSubscriptions = Get-ExistingSubscriptions
$subscriptionPlacementStates = Get-ConfiguredSubscriptionPlacementState `
  -SubscriptionPlacements @($governanceConfiguration.subscriptionPlacement) `
  -ExistingSubscriptions $existingSubscriptions `
  -ExistingEntities $existingEntities
$armToken = az account get-access-token --resource-type arm --query accessToken -o tsv

Write-Section 'Azure governance bootstrap plan'
Write-Host "Tenant: $tenantId"
Write-Host "Legacy management group candidate: $LegacyManagementGroupName"
Write-Host 'Target management-group hierarchy:'

foreach ($definition in $managementGroupDefinitions) {
  $parentDisplay = if ($definition.ParentName) { $definition.ParentName } else { '<tenant-root>' }
  Write-Host "  - $($definition.Name) [$parentDisplay]"
}

Write-Host 'Target subscription placements:'

foreach ($state in $subscriptionPlacementStates) {
  $status = if ($state.Exists) {
    $currentDisplay = if ($state.CurrentManagementGroup) { $state.CurrentManagementGroup } else { '<tenant-root>' }
    "$($state.SubscriptionId) [$currentDisplay -> $($state.TargetManagementGroup)]"
  } else {
    "missing [-> $($state.TargetManagementGroup)]"
  }

  Write-Host "  - $($state.DisplayName): $status"
}

if ($Mode -eq 'show-plan') {
  return
}

foreach ($definition in $managementGroupDefinitions) {
  Ensure-ManagementGroup `
    -Definition $definition `
    -ExistingManagementGroups $existingManagementGroups `
    -ExistingEntities $existingEntities

  $existingManagementGroups = Get-ExistingManagementGroups
  $existingEntities = Get-ExistingEntities
}

foreach ($state in $subscriptionPlacementStates) {
  if (-not $state.Exists) {
    continue
  }

  Ensure-SubscriptionPlacement `
    -SubscriptionId $state.SubscriptionId `
    -TargetManagementGroupName $state.TargetManagementGroup `
    -ExistingEntities $existingEntities `
    -ArmToken $armToken

  $existingEntities = Get-ExistingEntities
}

$existingEntities = Get-ExistingEntities
$existingSubscriptions = Get-ExistingSubscriptions
$subscriptionPlacementStates = Get-ConfiguredSubscriptionPlacementState `
  -SubscriptionPlacements @($governanceConfiguration.subscriptionPlacement) `
  -ExistingSubscriptions $existingSubscriptions `
  -ExistingEntities $existingEntities

if ($RemoveEmptyLegacyManagementGroup.IsPresent -and $LegacyManagementGroupName -ne $targetManagementGroupName) {
  Remove-EmptyManagementGroup `
    -ManagementGroupName $LegacyManagementGroupName `
    -ExistingEntities $existingEntities

  $existingEntities = Get-ExistingEntities
  $existingSubscriptions = Get-ExistingSubscriptions
  $subscriptionPlacementStates = Get-ConfiguredSubscriptionPlacementState `
    -SubscriptionPlacements @($governanceConfiguration.subscriptionPlacement) `
    -ExistingSubscriptions $existingSubscriptions `
    -ExistingEntities $existingEntities
}

[ordered]@{
  tenantId = $tenantId
  managementGroups = @($managementGroupDefinitions | ForEach-Object { $_.Name })
  subscriptionPlacements = @($subscriptionPlacementStates | ForEach-Object {
    [ordered]@{
      displayName = $_.DisplayName
      subscriptionId = $_.SubscriptionId
      currentManagementGroup = $_.CurrentManagementGroup
      targetManagementGroup = $_.TargetManagementGroup
      exists = $_.Exists
    }
  })
  legacyManagementGroup = $LegacyManagementGroupName
  legacyManagementGroupRemoved = $RemoveEmptyLegacyManagementGroup.IsPresent
} | ConvertTo-Json -Depth 5
