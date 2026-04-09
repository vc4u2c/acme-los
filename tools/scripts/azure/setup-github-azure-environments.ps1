[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet('show-plan', 'bootstrap-platform', 'bootstrap-automation', 'sync-environments')]
  [string]$Mode = 'show-plan',

  [string]$ConfigurationPath,
  [string]$GitHubOrganizationName,
  [string]$GitHubRepositoryName,
  [string]$AzureTenantId,
  [string]$PlatformSubscriptionId,
  [string]$NonProdSubscriptionId,
  [string]$ProdSubscriptionId,
  [switch]$IncludeMainBranchSubject
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ConfigurationPath) {
  $ConfigurationPath = Join-Path $PSScriptRoot '..\..\..\infra\azure\config\platform.json'
}

function Write-Section {
  param([string]$Message)

  Write-Host
  Write-Host $Message -ForegroundColor Cyan
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

function Resolve-GitHubContext {
  param(
    [string]$Owner,
    [string]$RepositoryName
  )

  $resolvedOwner = $Owner
  $resolvedRepositoryName = $RepositoryName

  if (-not $resolvedOwner) {
    $resolvedOwner = gh repo view --json owner -q '.owner.login'
  }

  if (-not $resolvedRepositoryName) {
    $resolvedRepositoryName = gh repo view --json name -q '.name'
  }

  if (-not $resolvedOwner -or -not $resolvedRepositoryName) {
    throw 'Unable to resolve the GitHub repository owner and name.'
  }

  return @{
    Owner = $resolvedOwner
    RepositoryName = $resolvedRepositoryName
    RepositoryUrl = "https://github.com/$resolvedOwner/$resolvedRepositoryName"
  }
}

function Resolve-AzureContext {
  param(
    $Configuration,
    [string]$TenantId,
    [string]$PlatformSubscription,
    [string]$NonProdSubscription,
    [string]$ProdSubscription
  )

  $account = az account show --output json | ConvertFrom-Json
  $subscriptions = ConvertTo-ObjectArray (az account subscription list --output json | ConvertFrom-Json)
  $resolvedTenantId = if ($TenantId) { $TenantId } else { $account.tenantId }

  return @{
    TenantId = $resolvedTenantId
    PlatformSubscriptionId = Resolve-SubscriptionIdFromList -ExplicitValue $PlatformSubscription -ConfiguredDisplayName $Configuration.subscriptions.platform -RoleLabel 'platform' -Subscriptions $subscriptions
    NonProdSubscriptionId = Resolve-SubscriptionIdFromList -ExplicitValue $NonProdSubscription -ConfiguredDisplayName $Configuration.subscriptions.nonprodOnline -RoleLabel 'non-production' -Subscriptions $subscriptions
    ProdSubscriptionId = Resolve-SubscriptionIdFromList -ExplicitValue $ProdSubscription -ConfiguredDisplayName $Configuration.subscriptions.prodOnline -RoleLabel 'production' -Subscriptions $subscriptions
  }
}

function Test-ResourceGroupExists {
  param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName
  )

  $exists = az group exists --subscription $SubscriptionId --name $ResourceGroupName --output tsv
  return $exists -eq 'true'
}

function Resolve-SubscriptionIdFromList {
  param(
    [string]$ExplicitValue,
    [string]$ConfiguredDisplayName,
    [string]$RoleLabel,
    [object[]]$Subscriptions
  )

  if ($ExplicitValue) {
    return $ExplicitValue
  }

  $subscription = @(
    $Subscriptions |
      Where-Object { $_.displayName -eq $ConfiguredDisplayName } |
      Select-Object -First 1
  )

  if ($subscription.Count -gt 0 -and $subscription[0]) {
    return $subscription[0].subscriptionId
  }

  $entities = ConvertTo-ObjectArray (az account management-group entities list --output json | ConvertFrom-Json)
  $entity = @(
    $entities |
      Where-Object {
        $_.type -eq '/subscriptions' -and $_.displayName -eq $ConfiguredDisplayName
      } |
      Select-Object -First 1
  )

  if ($entity.Count -gt 0 -and $entity[0]) {
    return [string]$entity[0].name
  }

  throw "Unable to resolve the $RoleLabel subscription '$ConfiguredDisplayName'. Create it first or pass an explicit subscription id."
}

function Get-EnvironmentNames {
  param($Configuration)

  return @($Configuration.environments.PSObject.Properties.Name)
}

function Get-EnvironmentConfiguration {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  $property = $Configuration.environments.PSObject.Properties[$EnvironmentName]
  if (-not $property) {
    throw "Unknown environment '$EnvironmentName'."
  }

  return $property.Value
}

function Get-EnvironmentSubscriptionId {
  param(
    $Configuration,
    $AzureContext,
    [string]$EnvironmentName
  )

  $environmentConfiguration = Get-EnvironmentConfiguration -Configuration $Configuration -EnvironmentName $EnvironmentName

  switch ($environmentConfiguration.subscriptionRole) {
    'platform' { return $AzureContext.PlatformSubscriptionId }
    'prod' { return $AzureContext.ProdSubscriptionId }
    default { return $AzureContext.NonProdSubscriptionId }
  }
}

function Get-WorkloadResourceGroupName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "rg-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-DeploymentStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ImagesSubscriptionRole {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  $environmentConfiguration = Get-EnvironmentConfiguration -Configuration $Configuration -EnvironmentName $EnvironmentName

  if ($environmentConfiguration.subscriptionRole -eq 'prod') {
    return 'prod'
  }

  return 'nonprod'
}

function Get-ImagesResourceGroupName {
  param(
    $Configuration,
    [string]$SubscriptionRole
  )

  return "rg-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-images-$SubscriptionRole-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ContainerRegistryName {
  param(
    $Configuration,
    [string]$SubscriptionRole
  )

  return "acr$($Configuration.organizationShortName)$($Configuration.workloadShortName)$SubscriptionRole$($Configuration.primaryRegionShortName)01$($Configuration.resourceNameSuffix)".ToLowerInvariant()
}

function Get-ContainerAppEnvironmentName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "cae-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ContainerAppName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "ca-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-UserAssignedIdentityName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "id-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-KeyVaultName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "kv$($Configuration.organizationShortName)$($Configuration.workloadShortName)$EnvironmentName$($Configuration.primaryRegionShortName)01$($Configuration.resourceNameSuffix)".ToLowerInvariant()
}

function Get-PlatformNetworkResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.networkResourceGroupName
}

function Get-PlatformMonitorResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.monitorResourceGroupName
}

function Get-WorkloadVirtualNetworkName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "vnet-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-AppSubnetName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "snet-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-app-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-DataSubnetName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "snet-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-data-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-AcaInfrastructureSubnetName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return Get-AppSubnetName -Configuration $Configuration -EnvironmentName $EnvironmentName
}

function Get-PrivateEndpointSubnetName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return Get-DataSubnetName -Configuration $Configuration -EnvironmentName $EnvironmentName
}

function Ensure-GitHubEnvironment {
  param(
    [string]$Owner,
    [string]$RepositoryName,
    [string]$EnvironmentName
  )

  if ($PSCmdlet.ShouldProcess("GitHub environment '$EnvironmentName'", 'Create or update')) {
    gh api --method PUT "repos/$Owner/$RepositoryName/environments/$EnvironmentName" | Out-Null
  }
}

function Set-GitHubRepositoryVariable {
  param(
    [string]$RepositoryUrl,
    [string]$Name,
    [string]$Value
  )

  if ($PSCmdlet.ShouldProcess("Repository variable '$Name'", 'Set')) {
    gh variable set $Name --body $Value --repo $RepositoryUrl | Out-Null
  }
}

function Set-GitHubEnvironmentVariable {
  param(
    [string]$RepositoryUrl,
    [string]$EnvironmentName,
    [string]$Name,
    [string]$Value
  )

  if ($PSCmdlet.ShouldProcess("Environment variable '$EnvironmentName/$Name'", 'Set')) {
    gh variable set $Name --body $Value --env $EnvironmentName --repo $RepositoryUrl | Out-Null
  }
}

function Ensure-EntraApplication {
  param([string]$DisplayName)

  $existingApps = ConvertTo-ObjectArray (az ad app list --display-name $DisplayName --output json | ConvertFrom-Json)
  $existing = @(
    $existingApps |
      Where-Object {
        $_.PSObject.Properties.Name -contains 'displayName' -and $_.displayName -eq $DisplayName
      } |
      Select-Object -First 1
  )

  if ($existing.Count -gt 0 -and $existing[0]) {
    return $existing[0]
  }

  if (-not $PSCmdlet.ShouldProcess("Entra application '$DisplayName'", 'Create')) {
    return $null
  }

  return az ad app create --display-name $DisplayName --output json | ConvertFrom-Json
}

function Ensure-ServicePrincipal {
  param([string]$AppId)

  $existing = $null

  try {
    $existing = az ad sp show --id $AppId --output json 2>$null | ConvertFrom-Json
  } catch {
    $existing = $null
  }

  if ($existing) {
    return $existing
  }

  if (-not $PSCmdlet.ShouldProcess("Service principal for app '$AppId'", 'Create')) {
    return $null
  }

  az ad sp create --id $AppId --output json | ConvertFrom-Json | Out-Null
  return az ad sp show --id $AppId --output json | ConvertFrom-Json
}

function Ensure-FederatedCredential {
  param(
    [string]$ApplicationObjectId,
    [string]$CredentialName,
    [string]$Subject
  )

  $existingCredentials = @()

  for ($attempt = 1; $attempt -le 12; $attempt++) {
    try {
      $existingCredentials = ConvertTo-ObjectArray (az ad app federated-credential list --id $ApplicationObjectId --output json 2>$null | ConvertFrom-Json)
      break
    } catch {
      if ($attempt -eq 12) {
        throw
      }

      Start-Sleep -Seconds 5
    }
  }

  $existing = @(
    $existingCredentials |
      Where-Object {
        $_.PSObject.Properties.Name -contains 'name' -and $_.name -eq $CredentialName
      } |
      Select-Object -First 1
  )

  if ($existing.Count -gt 0 -and $existing[0]) {
    return
  }

  if (-not $PSCmdlet.ShouldProcess("Federated credential '$CredentialName'", 'Create')) {
    return
  }

  $payloadPath = Join-Path $env:TEMP "$CredentialName.$ApplicationObjectId.json"
  @(
    @{
      name = $CredentialName
      issuer = 'https://token.actions.githubusercontent.com'
      subject = $Subject
      audiences = @('api://AzureADTokenExchange')
    } | ConvertTo-Json -Depth 5
  ) | Set-Content -Path $payloadPath -Encoding utf8

  $created = $false

  for ($attempt = 1; $attempt -le 6; $attempt++) {
    try {
      az ad app federated-credential create --id $ApplicationObjectId --parameters "@$payloadPath" 2>$null | Out-Null
      $created = $true
      break
    } catch {
      if ($attempt -eq 6) {
        throw
      }

      Start-Sleep -Seconds 5
    }
  }

  Remove-Item -Force $payloadPath -ErrorAction SilentlyContinue

  if (-not $created) {
    throw "Federated credential '$CredentialName' was not created for application '$ApplicationObjectId'."
  }
}

function Ensure-RoleAssignment {
  param(
    [string]$PrincipalAppId,
    [string]$RoleName,
    [string]$Scope
  )

  $existingAssignments = ConvertTo-ObjectArray (az role assignment list --assignee $PrincipalAppId --scope $scope --output json | ConvertFrom-Json)
  $existing = @(
    $existingAssignments |
      Where-Object {
        $_.PSObject.Properties.Name -contains 'roleDefinitionName' -and $_.roleDefinitionName -eq $RoleName
      } |
      Select-Object -First 1
  )

  if ($existing.Count -gt 0 -and $existing[0]) {
    return
  }

  if ($PSCmdlet.ShouldProcess("$RoleName role on $scope", 'Assign')) {
    az role assignment create --assignee $PrincipalAppId --role $RoleName --scope $scope --output none
  }
}

function Get-EnvironmentVariables {
  param(
    $Configuration,
    $AzureContext,
    [string]$EnvironmentName,
    [string]$AzureClientId
  )

  $environmentConfiguration = Get-EnvironmentConfiguration -Configuration $Configuration -EnvironmentName $EnvironmentName
  $imagesSubscriptionRole = Get-ImagesSubscriptionRole -Configuration $Configuration -EnvironmentName $EnvironmentName

  return [ordered]@{
    AZURE_CLIENT_ID = $AzureClientId
    AZURE_SUBSCRIPTION_ID = Get-EnvironmentSubscriptionId -Configuration $Configuration -AzureContext $AzureContext -EnvironmentName $EnvironmentName
    AZURE_ENVIRONMENT_NAME = $EnvironmentName
    APP_ENVIRONMENT_NAME = $environmentConfiguration.appEnvironmentName
    OKTA_ENVIRONMENT_NAME = $environmentConfiguration.oktaEnvironmentName
    AZURE_LOCATION_PRIMARY = $Configuration.primaryLocation
    AZURE_PRIMARY_REGION_SHORT = $Configuration.primaryRegionShortName
    AZURE_PLATFORM_NETWORK_RESOURCE_GROUP_NAME = Get-PlatformNetworkResourceGroupName -Configuration $Configuration
    AZURE_PLATFORM_MONITOR_RESOURCE_GROUP_NAME = Get-PlatformMonitorResourceGroupName -Configuration $Configuration
    AZURE_RESOURCE_GROUP_NAME = Get-WorkloadResourceGroupName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_DEPLOYMENT_STACK_NAME = Get-DeploymentStackName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_IMAGES_SUBSCRIPTION_ROLE = $imagesSubscriptionRole
    AZURE_IMAGES_RESOURCE_GROUP_NAME = Get-ImagesResourceGroupName -Configuration $Configuration -SubscriptionRole $imagesSubscriptionRole
    AZURE_CONTAINER_REGISTRY_NAME = Get-ContainerRegistryName -Configuration $Configuration -SubscriptionRole $imagesSubscriptionRole
    AZURE_CONTAINER_APPS_ENVIRONMENT_NAME = Get-ContainerAppEnvironmentName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_CONTAINER_APP_NAME = Get-ContainerAppName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_USER_ASSIGNED_IDENTITY_NAME = Get-UserAssignedIdentityName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_WORKLOAD_VNET_NAME = Get-WorkloadVirtualNetworkName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_APP_SUBNET_NAME = Get-AppSubnetName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_DATA_SUBNET_NAME = Get-DataSubnetName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_ACA_INFRA_SUBNET_NAME = Get-AcaInfrastructureSubnetName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_PRIVATE_ENDPOINT_SUBNET_NAME = Get-PrivateEndpointSubnetName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_KEY_VAULT_NAME = Get-KeyVaultName -Configuration $Configuration -EnvironmentName $EnvironmentName
    AZURE_WEB_IMAGE_REPOSITORY = 'acme-los-web'
    AZURE_BICEP_PARAMETER_FILE = "infra/azure/bicep/$EnvironmentName.bicepparam"
    AZURE_WEB_DEPLOY_TEMPLATE = 'infra/azure/bicep/main.web.rg.bicep'
  }
}

function Write-PlanSummary {
  param(
    $Configuration,
    $AzureContext,
    $GitHubContext
  )

  Write-Section 'Azure / GitHub environment plan'
  Write-Host "Repository: $($GitHubContext.Owner)/$($GitHubContext.RepositoryName)"
  Write-Host "Tenant: $($AzureContext.TenantId)"
  Write-Host "Platform subscription: $($AzureContext.PlatformSubscriptionId)"
  Write-Host "Nonprod subscription: $($AzureContext.NonProdSubscriptionId)"
  Write-Host "Prod subscription: $($AzureContext.ProdSubscriptionId)"
  Write-Host "Platform network rg: $(Get-PlatformNetworkResourceGroupName -Configuration $Configuration)"
  Write-Host 'Environments:'

  foreach ($environmentName in (Get-EnvironmentNames -Configuration $Configuration)) {
    $environmentVariables = Get-EnvironmentVariables -Configuration $Configuration -AzureContext $AzureContext -EnvironmentName $environmentName -AzureClientId '<created-by-bootstrap>'
    Write-Host "  - $environmentName"
    Write-Host "    subscription: $($environmentVariables.AZURE_SUBSCRIPTION_ID)"
    Write-Host "    resource group: $($environmentVariables.AZURE_RESOURCE_GROUP_NAME)"
    Write-Host "    container app: $($environmentVariables.AZURE_CONTAINER_APP_NAME)"
    Write-Host "    container apps env: $($environmentVariables.AZURE_CONTAINER_APPS_ENVIRONMENT_NAME)"
    Write-Host "    workload vnet: $($environmentVariables.AZURE_WORKLOAD_VNET_NAME)"
    Write-Host "    images rg: $($environmentVariables.AZURE_IMAGES_RESOURCE_GROUP_NAME)"
    Write-Host "    acr: $($environmentVariables.AZURE_CONTAINER_REGISTRY_NAME)"
    Write-Host "    key vault: $($environmentVariables.AZURE_KEY_VAULT_NAME)"
    Write-Host "    okta env: $($environmentVariables.OKTA_ENVIRONMENT_NAME)"
  }
}

Test-RequiredCommand -Name 'az'
Test-RequiredCommand -Name 'gh'

$configuration = Get-JsonFile -Path $ConfigurationPath
$gitHubContext = Resolve-GitHubContext -Owner $GitHubOrganizationName -RepositoryName $GitHubRepositoryName
$azureContext = Resolve-AzureContext -Configuration $configuration -TenantId $AzureTenantId -PlatformSubscription $PlatformSubscriptionId -NonProdSubscription $NonProdSubscriptionId -ProdSubscription $ProdSubscriptionId
$environmentNames = Get-EnvironmentNames -Configuration $configuration

if ($Mode -in @('bootstrap-platform', 'bootstrap-automation')) {
  $platformNetworkResourceGroupName = Get-PlatformNetworkResourceGroupName -Configuration $configuration
  $platformMonitorResourceGroupName = Get-PlatformMonitorResourceGroupName -Configuration $configuration

  if (-not (Test-ResourceGroupExists -SubscriptionId $azureContext.PlatformSubscriptionId -ResourceGroupName $platformNetworkResourceGroupName)) {
    throw "Platform network resource group '$platformNetworkResourceGroupName' does not exist in the platform subscription. Run 'npm run azure:deploy:platform-network' first."
  }

  if (-not (Test-ResourceGroupExists -SubscriptionId $azureContext.PlatformSubscriptionId -ResourceGroupName $platformMonitorResourceGroupName)) {
    throw "Platform monitor resource group '$platformMonitorResourceGroupName' does not exist in the platform subscription. Deploy the platform monitoring resources first."
  }
}

Write-PlanSummary -Configuration $configuration -AzureContext $azureContext -GitHubContext $gitHubContext

if ($Mode -eq 'show-plan') {
  return
}

$repoVariables = [ordered]@{
  AZURE_TENANT_ID = $azureContext.TenantId
  AZURE_SUBSCRIPTION_ID_PLATFORM = $azureContext.PlatformSubscriptionId
  AZURE_SUBSCRIPTION_ID_NONPROD = $azureContext.NonProdSubscriptionId
  AZURE_SUBSCRIPTION_ID_PROD = $azureContext.ProdSubscriptionId
  AZURE_PLATFORM_SUBSCRIPTION_NAME = $configuration.subscriptions.platform
  AZURE_NONPROD_SUBSCRIPTION_NAME = $configuration.subscriptions.nonprodOnline
  AZURE_PROD_SUBSCRIPTION_NAME = $configuration.subscriptions.prodOnline
  AZURE_LOCATION_PRIMARY = $configuration.primaryLocation
  AZURE_PRIMARY_REGION_SHORT = $configuration.primaryRegionShortName
  AZURE_PLATFORM_NETWORK_RESOURCE_GROUP_NAME = Get-PlatformNetworkResourceGroupName -Configuration $configuration
  AZURE_PRIVATE_DNS_ZONE_KEY_VAULT = $configuration.platformResources.privateDnsZones.keyVault
  AZURE_PRIVATE_DNS_ZONE_MANAGED_REDIS = $configuration.platformResources.privateDnsZones.managedRedis
  PROJECT_NAME = $configuration.projectName
  PROJECT_SHORT_NAME = $configuration.workloadShortName
  AZURE_ENVIRONMENTS = ($environmentNames -join ',')
  AZURE_RESOURCE_NAME_PREFIX = $configuration.organizationShortName
}

Write-Section "Running mode '$Mode'"

foreach ($pair in $repoVariables.GetEnumerator()) {
  Set-GitHubRepositoryVariable -RepositoryUrl $gitHubContext.RepositoryUrl -Name $pair.Key -Value $pair.Value
}

foreach ($environmentName in $environmentNames) {
  Ensure-GitHubEnvironment -Owner $gitHubContext.Owner -RepositoryName $gitHubContext.RepositoryName -EnvironmentName $environmentName

  $appId = ''

  if ($Mode -in @('bootstrap-platform', 'bootstrap-automation')) {
    $displayName = "gha-$($configuration.projectName)-$environmentName"
    $application = Ensure-EntraApplication -DisplayName $displayName

    if ($application) {
      Ensure-ServicePrincipal -AppId $application.appId | Out-Null
      Ensure-FederatedCredential -ApplicationObjectId $application.id -CredentialName "github-environment-$environmentName" -Subject "repo:$($gitHubContext.Owner)/$($gitHubContext.RepositoryName):environment:$environmentName"

      if ($IncludeMainBranchSubject.IsPresent) {
        Ensure-FederatedCredential -ApplicationObjectId $application.id -CredentialName 'github-main' -Subject "repo:$($gitHubContext.Owner)/$($gitHubContext.RepositoryName):ref:refs/heads/main"
      }

      $targetSubscriptionId = Get-EnvironmentSubscriptionId -Configuration $configuration -AzureContext $azureContext -EnvironmentName $environmentName
      $targetSubscriptionScope = "/subscriptions/$targetSubscriptionId"
      $platformNetworkScope = "/subscriptions/$($azureContext.PlatformSubscriptionId)/resourceGroups/$(Get-PlatformNetworkResourceGroupName -Configuration $configuration)"
      $platformMonitorScope = "/subscriptions/$($azureContext.PlatformSubscriptionId)/resourceGroups/$(Get-PlatformMonitorResourceGroupName -Configuration $configuration)"
      Ensure-RoleAssignment -PrincipalAppId $application.appId -RoleName 'Contributor' -Scope $targetSubscriptionScope
      Ensure-RoleAssignment -PrincipalAppId $application.appId -RoleName 'User Access Administrator' -Scope $targetSubscriptionScope
      Ensure-RoleAssignment -PrincipalAppId $application.appId -RoleName 'Contributor' -Scope $platformNetworkScope
      Ensure-RoleAssignment -PrincipalAppId $application.appId -RoleName 'Contributor' -Scope $platformMonitorScope
      $appId = $application.appId
    }
  }

  $environmentVariables = Get-EnvironmentVariables -Configuration $configuration -AzureContext $azureContext -EnvironmentName $environmentName -AzureClientId $appId

  foreach ($pair in $environmentVariables.GetEnumerator()) {
    Set-GitHubEnvironmentVariable -RepositoryUrl $gitHubContext.RepositoryUrl -EnvironmentName $environmentName -Name $pair.Key -Value $pair.Value
  }
}

Write-Section 'Bootstrap complete'
Write-Host 'Review the GitHub environment variables and Azure identities before the first deployment.'
