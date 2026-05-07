[CmdletBinding()]
param(
  [ValidateSet('dev', 'qa', 'stg', 'prod')]
  [Parameter(Mandatory = $true)]
  [string]$EnvironmentName,

  [string]$SubscriptionId,
  [string]$PlatformSubscriptionId,
  [string]$TenantId,
  [string]$Location = 'centralus',
  [ValidateSet('file', 'redis')]
  [string]$StateStoreMode,
  [string]$ImageTag,
  [string]$WebImageRepository = 'acme-los-web',
  [string]$BffImageRepository = 'acme-los-bff-api',
  [string]$BffVersion,
  [ValidateSet('auto', 'enabled', 'disabled')]
  [string]$BffDeploymentMode = 'auto',
  [string]$ConfigurationPath,
  [string]$ParameterFile,
  [string]$WorkloadTemplateFile,
  [string]$WebTemplateFile,
  [string]$WebRuntimeTemplateFile,
  [string]$WebMonitoringTemplateFile,
  [string]$PlatformWorkloadLinksTemplateFile,
  [string]$ImagesSubscriptionTemplateFile,
  [string]$ImagesResourceTemplateFile,
  [string]$WorkbookSyncScriptFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ParameterFile) {
  $ParameterFile = Join-Path $PSScriptRoot "..\..\..\infra\azure\bicep\$EnvironmentName.bicepparam"
}

if (-not $ConfigurationPath) {
  $ConfigurationPath = Join-Path $PSScriptRoot '..\..\..\infra\azure\config\platform.json'
}

if (-not $WorkloadTemplateFile) {
  $WorkloadTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.workload.sub.bicep'
}

if (-not $WebTemplateFile) {
  $WebTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.web.rg.bicep'
}

if (-not $ImagesSubscriptionTemplateFile) {
  $ImagesSubscriptionTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.images.sub.bicep'
}

if (-not $ImagesResourceTemplateFile) {
  $ImagesResourceTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.images.rg.bicep'
}

if (-not $WebRuntimeTemplateFile) {
  $WebRuntimeTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.web.runtime.rg.bicep'
}

if (-not $WebMonitoringTemplateFile) {
  $WebMonitoringTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.web.monitoring.rg.bicep'
}

if (-not $PlatformWorkloadLinksTemplateFile) {
  $PlatformWorkloadLinksTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.platform.workload-links.rg.bicep'
}

if (-not $WorkbookSyncScriptFile) {
  $WorkbookSyncScriptFile = Join-Path $PSScriptRoot 'sync-monitoring-workbook.ps1'
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

function Resolve-SubscriptionIdFromConfiguration {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  $environmentConfiguration = Get-EnvironmentConfiguration -Configuration $Configuration -EnvironmentName $EnvironmentName
  $targetDisplayName = if ($environmentConfiguration.subscriptionRole -eq 'prod') {
    $Configuration.subscriptions.prodOnline
  } else {
    $Configuration.subscriptions.nonprodOnline
  }

  return Resolve-SubscriptionIdByDisplayName -DisplayName $targetDisplayName -FailureMessage "Unable to resolve the subscription '$targetDisplayName' for environment '$EnvironmentName'."
}

function Resolve-SubscriptionIdByDisplayName {
  param(
    [string]$DisplayName,
    [string]$FailureMessage
  )

  $subscriptions = ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('account', 'subscription', 'list'))
  $subscription = @(
    $subscriptions |
      Where-Object { $_.displayName -eq $DisplayName } |
      Select-Object -First 1
  )

  if ($subscription.Count -gt 0 -and $subscription[0]) {
    return [string]$subscription[0].subscriptionId
  }

  $entities = ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('account', 'management-group', 'entities', 'list'))
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

function Resolve-PlatformSubscriptionIdFromConfiguration {
  param($Configuration)

  return Resolve-SubscriptionIdByDisplayName -DisplayName $Configuration.subscriptions.platform -FailureMessage "Unable to resolve the platform subscription '$($Configuration.subscriptions.platform)'."
}

function Ensure-RegisteredResourceProviders {
  param(
    [string]$SubscriptionId,
    [string[]]$Namespaces
  )

  foreach ($namespace in $Namespaces) {
    $registrationState = az provider show --subscription $SubscriptionId --namespace $namespace --query registrationState --output tsv

    if ($registrationState -eq 'Registered') {
      continue
    }

    az provider register --subscription $SubscriptionId --namespace $namespace --wait --output none
  }
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

  $resolvedArgumentsArray = $resolvedArguments.ToArray()
  $commandOutput = az @resolvedArgumentsArray 2>&1
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

  $resolvedArgumentsArray = $resolvedArguments.ToArray()
  $commandOutput = az @resolvedArgumentsArray 2>&1
  if ($LASTEXITCODE -ne 0) {
    $errorMessage = [string]::Join([Environment]::NewLine, $commandOutput)
    throw "Azure CLI command failed: az $($Arguments -join ' ')`n$errorMessage"
  }
}

function Test-ContainerRegistryTagExists {
  param(
    [string]$SubscriptionId,
    [string]$RegistryName,
    [string]$RepositoryName,
    [string]$Tag
  )

  $query = "[?@=='$Tag'] | length(@)"
  $tagCount = az acr repository show-tags `
    --subscription $SubscriptionId `
    --name $RegistryName `
    --repository $RepositoryName `
    --query $query `
    --output tsv `
    --only-show-errors 2>$null

  if ($LASTEXITCODE -ne 0) {
    return $false
  }

  return [int]$tagCount -gt 0
}

function Get-WorkloadResourceGroupName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "rg-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
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

function Get-BffContainerAppName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "ca-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-bff-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
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

function Get-EnvironmentNetworkConfiguration {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  $environmentConfiguration = Get-EnvironmentConfiguration -Configuration $Configuration -EnvironmentName $EnvironmentName

  if (-not $environmentConfiguration.network) {
    throw "Environment '$EnvironmentName' is missing network configuration in platform.json."
  }

  return $environmentConfiguration.network
}

function Get-ImagesResourceGroupName {
  param(
    $Configuration,
    [string]$SubscriptionRole
  )

  return "rg-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-images-$SubscriptionRole-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ImagesSubscriptionStackName {
  param(
    $Configuration,
    [string]$SubscriptionRole
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-images-$SubscriptionRole-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ImagesResourceGroupStackName {
  param(
    $Configuration,
    [string]$SubscriptionRole
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-images-registry-$SubscriptionRole-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-PlatformNetworkResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.networkResourceGroupName
}

function Get-PlatformMonitorResourceGroupName {
  param($Configuration)

  return [string]$Configuration.platformResources.monitorResourceGroupName
}

function Get-PlatformWorkloadLinksStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-dns-links-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-PlatformMonitoringStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-monitor-$EnvironmentName-$($Configuration.primaryRegionShortName)-01".ToLowerInvariant()
}

function Get-ContainerRegistryName {
  param(
    $Configuration,
    [string]$SubscriptionRole
  )

  return "acr$($Configuration.organizationShortName)$($Configuration.workloadShortName)$SubscriptionRole$($Configuration.primaryRegionShortName)01$($Configuration.resourceNameSuffix)".ToLowerInvariant()
}

function Get-ResolvedImageTag {
  param(
    [string]$ExplicitTag,
    [string]$EnvironmentName
  )

  $resolvedTag = $null

  if ($ExplicitTag) {
    $resolvedTag = $ExplicitTag
  } elseif ($env:GITHUB_SHA) {
    $resolvedTag = $env:GITHUB_SHA.ToLowerInvariant()
  } else {
    try {
      $gitCommit = (git rev-parse HEAD 2>$null).Trim()
      if ($gitCommit) {
        $resolvedTag = $gitCommit.ToLowerInvariant()
      }
    } catch {
    }
  }

  if (-not $resolvedTag) {
    throw 'Unable to resolve an image tag. Pass -ImageTag explicitly or run inside a git checkout.'
  }

  if ($resolvedTag.EndsWith("-$EnvironmentName")) {
    return $resolvedTag
  }

  return "$resolvedTag-$EnvironmentName"
}

function Get-ResolvedBuildId {
  param(
    [string]$ExplicitTag
  )

  if ($ExplicitTag) {
    $normalizedTag = $ExplicitTag.ToLowerInvariant()
    if ($normalizedTag -match '^([0-9a-f]{7,40})(?:-[a-z0-9._-]+)?$') {
      return $Matches[1].Substring(0, [Math]::Min(8, $Matches[1].Length))
    }

    return $normalizedTag
  }

  if ($env:GITHUB_SHA) {
    return $env:GITHUB_SHA.Substring(0, [Math]::Min(8, $env:GITHUB_SHA.Length)).ToLowerInvariant()
  }

  try {
    $gitCommit = (git rev-parse --short HEAD 2>$null).Trim()
    if ($gitCommit) {
      return $gitCommit.ToLowerInvariant()
    }
  } catch {
  }

  throw 'Unable to resolve an application build id. Pass -ImageTag explicitly or run inside a git checkout.'
}

function Get-ResolvedBffVersion {
  param(
    [string]$ExplicitVersion,
    [string]$RepositoryRoot,
    [string]$FallbackVersion
  )

  $trimmedVersion = Get-OptionalString $ExplicitVersion
  if ($trimmedVersion) {
    return $trimmedVersion
  }

  $manifestPath = Join-Path $RepositoryRoot 'apps\bff-api\src\Acme.Los.Bff.Api\package.json'
  if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-JsonFile -Path $manifestPath
    $manifestVersion = Get-OptionalString $manifest.version

    if ($manifestVersion) {
      return $manifestVersion
    }
  }

  return $FallbackVersion
}

function Get-StringOutputValue {
  param(
    $Outputs,
    [string]$Name
  )

  if ($null -eq $Outputs) {
    return ''
  }

  $property = $Outputs.PSObject.Properties[$Name]
  if (-not $property -or $null -eq $property.Value) {
    return ''
  }

  return [string]$property.Value.value
}

function Get-IntegerOutputValue {
  param(
    $Outputs,
    [string]$Name
  )

  if ($null -eq $Outputs) {
    return 0
  }

  $property = $Outputs.PSObject.Properties[$Name]
  if (-not $property -or $null -eq $property.Value) {
    return 0
  }

  return [int]$property.Value.value
}

function Get-DeploymentOutputs {
  param($DeploymentResult)

  if ($null -eq $DeploymentResult) {
    return $null
  }

  if ($DeploymentResult.PSObject.Properties.Name -contains 'outputs') {
    return $DeploymentResult.outputs
  }

  if (
    ($DeploymentResult.PSObject.Properties.Name -contains 'properties') -and
    $DeploymentResult.properties -and
    ($DeploymentResult.properties.PSObject.Properties.Name -contains 'outputs')
  ) {
    return $DeploymentResult.properties.outputs
  }

  return $null
}

function New-ContainerBuildContext {
  param([string]$RepositoryRoot)

  $buildContextPath = Join-Path ([System.IO.Path]::GetTempPath()) ("acme-los-acr-build-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $buildContextPath -Force | Out-Null

  $excludedDirectoryNames = @(
    '.git',
    '.github',
    '.nx',
    '.next',
    '.expo',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
    'tmp'
  )

  $excludedFileNames = @('.env.local')

  function Copy-FilteredDirectory {
    param(
      [string]$SourcePath,
      [string]$DestinationPath
    )

    New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null

    foreach ($child in Get-ChildItem -LiteralPath $SourcePath -Force) {
      if ($child.PSIsContainer) {
        if ($excludedDirectoryNames -contains $child.Name) {
          continue
        }

        Copy-FilteredDirectory -SourcePath $child.FullName -DestinationPath (Join-Path $DestinationPath $child.Name)
        continue
      }

      if ($excludedFileNames -contains $child.Name) {
        continue
      }

      Copy-Item -LiteralPath $child.FullName -Destination (Join-Path $DestinationPath $child.Name) -Force
    }
  }

  Copy-FilteredDirectory -SourcePath $RepositoryRoot -DestinationPath $buildContextPath

  return $buildContextPath
}

function New-CompiledParameterFile {
  param([string]$SourceParameterFile)

  $compiledParameterFile = Join-Path ([System.IO.Path]::GetTempPath()) ("acme-los-bicep-params-" + [guid]::NewGuid().ToString('N') + '.json')
  az bicep build-params --file $SourceParameterFile --outfile $compiledParameterFile --output none
  return $compiledParameterFile
}

function Get-UriEncodedString {
  param([string]$Value)

  return [System.Uri]::EscapeDataString($Value)
}

function New-SecureRandomBase64Url {
  param([int]$ByteLength = 48)

  $buffer = New-Object byte[] $ByteLength
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-OptionalString {
  param($Value)

  if ($Value -isnot [string]) {
    return $null
  }

  $trimmed = $Value.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    return $null
  }

  return $trimmed
}

function Join-AbsoluteUrl {
  param(
    [string]$BaseUrl,
    [string]$Path
  )

  return ([System.Uri]::new([System.Uri]::new($BaseUrl), $Path)).AbsoluteUri
}

function Get-OktaEnvironmentConfiguration {
  param(
    [string]$RepositoryRoot,
    [string]$OktaEnvironmentName
  )

  $environmentPath = Join-Path $RepositoryRoot "infra\okta\environments\$OktaEnvironmentName.json"
  if (-not (Test-Path -LiteralPath $environmentPath)) {
    throw "Okta environment file '$environmentPath' was not found."
  }

  return Get-JsonFile -Path $environmentPath
}

function Resolve-DeployedWebBaseUrl {
  param($WebConfiguration)

  $configuredBaseUrl = Get-OptionalString $WebConfiguration.deployedBaseUrl
  if ($configuredBaseUrl) {
    return $configuredBaseUrl
  }

  $fallbackBaseUrl = Get-OptionalString $WebConfiguration.baseUrl
  if ($fallbackBaseUrl) {
    return $fallbackBaseUrl
  }

  return (Get-OptionalString $WebConfiguration.localBaseUrl)
}

function Invoke-AzTsv {
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

  return [string]::Join([Environment]::NewLine, $commandOutput).Trim()
}

Test-RequiredCommand -Name 'az'

if (-not (Test-Path -LiteralPath $ConfigurationPath)) {
  throw "Configuration file '$ConfigurationPath' was not found."
}

if (-not (Test-Path -LiteralPath $ParameterFile)) {
  throw "Bicep parameter file '$ParameterFile' was not found."
}

if (-not (Test-Path -LiteralPath $WorkloadTemplateFile)) {
  throw "Subscription-scope template '$WorkloadTemplateFile' was not found."
}

if (-not (Test-Path -LiteralPath $WebTemplateFile)) {
  throw "Resource-group-scope template '$WebTemplateFile' was not found."
}

if (-not (Test-Path -LiteralPath $ImagesSubscriptionTemplateFile)) {
  throw "Images subscription-scope template '$ImagesSubscriptionTemplateFile' was not found."
}

if (-not (Test-Path -LiteralPath $ImagesResourceTemplateFile)) {
  throw "Images resource-group template '$ImagesResourceTemplateFile' was not found."
}

if (-not (Test-Path -LiteralPath $WebRuntimeTemplateFile)) {
  throw "Runtime resource-group template '$WebRuntimeTemplateFile' was not found."
}

$webMonitoringTemplateExists = Test-Path -LiteralPath $WebMonitoringTemplateFile
if (-not $webMonitoringTemplateExists) {
  throw "Monitoring resource-group template '$WebMonitoringTemplateFile' was not found."
}

$platformConfigurationTemplateExists = Test-Path -LiteralPath $PlatformWorkloadLinksTemplateFile
if (-not $platformConfigurationTemplateExists) {
  throw "Platform workload-links template '$PlatformWorkloadLinksTemplateFile' was not found."
}

if (-not (Test-Path -LiteralPath $WorkbookSyncScriptFile)) {
  throw "Workbook sync script '$WorkbookSyncScriptFile' was not found."
}

$configuration = Get-JsonFile -Path $ConfigurationPath
$environmentConfiguration = Get-EnvironmentConfiguration -Configuration $configuration -EnvironmentName $EnvironmentName
$account = az account show --output json | ConvertFrom-Json
$resolvedSubscriptionId = if ($SubscriptionId) { $SubscriptionId } else { Resolve-SubscriptionIdFromConfiguration -Configuration $configuration -EnvironmentName $EnvironmentName }
$resolvedPlatformSubscriptionId = if ($PlatformSubscriptionId) { $PlatformSubscriptionId } else { Resolve-PlatformSubscriptionIdFromConfiguration -Configuration $configuration }
$resolvedTenantId = if ($TenantId) { $TenantId } else { $account.tenantId }
$resolvedImageTag = Get-ResolvedImageTag -ExplicitTag $ImageTag -EnvironmentName $EnvironmentName
$resolvedBuildId = Get-ResolvedBuildId -ExplicitTag $ImageTag
$resolvedStateStoreMode = if ($StateStoreMode) { $StateStoreMode } else { 'redis' }
$resolvedBffDeploymentEnabled = $BffDeploymentMode -eq 'enabled' -or (
  $BffDeploymentMode -eq 'auto' -and $EnvironmentName -eq 'dev'
)
$imagesSubscriptionRole = Get-ImagesSubscriptionRole -Configuration $configuration -EnvironmentName $EnvironmentName
$networkConfiguration = Get-EnvironmentNetworkConfiguration -Configuration $configuration -EnvironmentName $EnvironmentName
$runtimeMinReplicas = if ($environmentConfiguration.runtime -and $null -ne $environmentConfiguration.runtime.minReplicas) {
  [int]$environmentConfiguration.runtime.minReplicas
} else {
  0
}
$runtimeMaxReplicas = if ($environmentConfiguration.runtime -and $null -ne $environmentConfiguration.runtime.maxReplicas) {
  [int]$environmentConfiguration.runtime.maxReplicas
} else {
  1
}
$bffRuntimeMinReplicas = if ($environmentConfiguration.bffRuntime -and $null -ne $environmentConfiguration.bffRuntime.minReplicas) {
  [int]$environmentConfiguration.bffRuntime.minReplicas
} else {
  $runtimeMinReplicas
}
$bffRuntimeMaxReplicas = if ($environmentConfiguration.bffRuntime -and $null -ne $environmentConfiguration.bffRuntime.maxReplicas) {
  [int]$environmentConfiguration.bffRuntime.maxReplicas
} else {
  $runtimeMaxReplicas
}
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$resolvedBffVersion = Get-ResolvedBffVersion -ExplicitVersion $BffVersion -RepositoryRoot $repositoryRoot -FallbackVersion $resolvedBuildId
$compiledParameterFile = New-CompiledParameterFile -SourceParameterFile $ParameterFile

Ensure-RegisteredResourceProviders -SubscriptionId $resolvedSubscriptionId -Namespaces @(
  'Microsoft.App',
  'Microsoft.Cache',
  'Microsoft.ContainerRegistry',
  'Microsoft.Insights',
  'Microsoft.KeyVault',
  'Microsoft.Network',
  'Microsoft.OperationalInsights'
)

Ensure-RegisteredResourceProviders -SubscriptionId $resolvedPlatformSubscriptionId -Namespaces @(
  'Microsoft.Insights',
  'Microsoft.OperationalInsights'
)

$resourceGroupName = Get-WorkloadResourceGroupName -Configuration $configuration -EnvironmentName $EnvironmentName
$subscriptionStackName = Get-SubscriptionStackName -Configuration $configuration -EnvironmentName $EnvironmentName
$resourceGroupStackName = Get-ResourceGroupStackName -Configuration $configuration -EnvironmentName $EnvironmentName
$imagesResourceGroupName = Get-ImagesResourceGroupName -Configuration $configuration -SubscriptionRole $imagesSubscriptionRole
$imagesSubscriptionStackName = Get-ImagesSubscriptionStackName -Configuration $configuration -SubscriptionRole $imagesSubscriptionRole
$imagesResourceGroupStackName = Get-ImagesResourceGroupStackName -Configuration $configuration -SubscriptionRole $imagesSubscriptionRole
$containerRegistryName = Get-ContainerRegistryName -Configuration $configuration -SubscriptionRole $imagesSubscriptionRole
$platformNetworkResourceGroupName = Get-PlatformNetworkResourceGroupName -Configuration $configuration
$platformMonitorResourceGroupName = Get-PlatformMonitorResourceGroupName -Configuration $configuration
$platformWorkloadLinksStackName = Get-PlatformWorkloadLinksStackName -Configuration $configuration -EnvironmentName $EnvironmentName
$platformMonitoringStackName = Get-PlatformMonitoringStackName -Configuration $configuration -EnvironmentName $EnvironmentName

if ($EnvironmentName -eq 'prod') {
  Write-Warning 'Production uses the same ACA deployment pattern, but teardown remains explicitly guarded and image promotions should be reviewed carefully.'
}

$subscriptionDeploymentArguments = @(
  'stack', 'sub', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--name', $subscriptionStackName,
  '--location', $Location,
  '--template-file', $WorkloadTemplateFile,
  '--parameters', "environmentName=$EnvironmentName", "location=$Location",
  '--action-on-unmanage', 'deleteResources',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS subscription-scope stack for $EnvironmentName web infrastructure",
  '--yes'
)

$imagesSubscriptionDeploymentArguments = @(
  'stack', 'sub', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--name', $imagesSubscriptionStackName,
  '--location', $Location,
  '--template-file', $ImagesSubscriptionTemplateFile,
  '--parameters', "subscriptionRole=$imagesSubscriptionRole", "location=$Location",
  '--action-on-unmanage', 'detachAll',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS subscription-scope stack for $imagesSubscriptionRole shared images infrastructure",
  '--yes'
)

$imagesResourceGroupDeploymentArguments = @(
  'stack', 'group', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--name', $imagesResourceGroupStackName,
  '--resource-group', $imagesResourceGroupName,
  '--template-file', $ImagesResourceTemplateFile,
  '--parameters', "subscriptionRole=$imagesSubscriptionRole", "location=$Location",
  '--action-on-unmanage', 'detachAll',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS shared $imagesSubscriptionRole ACR stack",
  '--yes'
)

$webDeploymentArguments = @(
  'stack', 'group', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--name', $resourceGroupStackName,
  '--resource-group', $resourceGroupName,
  '--template-file', $WebTemplateFile,
  '--parameters', "@$compiledParameterFile", "tenantId=$resolvedTenantId",
  '--parameters', "platformSubscriptionId=$resolvedPlatformSubscriptionId",
  '--parameters', "platformNetworkResourceGroupName=$platformNetworkResourceGroupName",
  '--parameters', "platformMonitorResourceGroupName=$platformMonitorResourceGroupName",
  '--parameters', "containerRegistryName=$containerRegistryName",
  '--parameters', "containerRegistryResourceGroupName=$imagesResourceGroupName",
  '--parameters', "workloadVnetAddressSpace=$($networkConfiguration.workloadVnetAddressSpace)",
  '--parameters', "acaInfrastructureSubnetAddressPrefix=$($networkConfiguration.acaInfrastructureSubnetAddressPrefix)",
  '--parameters', "privateEndpointSubnetAddressPrefix=$($networkConfiguration.privateEndpointSubnetAddressPrefix)",
  '--action-on-unmanage', 'deleteResources',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS resource-group ACA stack for $EnvironmentName",
  '--yes'
)

$runtimeDeploymentArguments = @()

$webDeploymentArguments += @('--parameters', "stateStoreMode=$resolvedStateStoreMode")

Invoke-AzNoOutput -Arguments $subscriptionDeploymentArguments
Invoke-AzNoOutput -Arguments $imagesSubscriptionDeploymentArguments
Invoke-AzNoOutput -Arguments $imagesResourceGroupDeploymentArguments
$imagesDeployment = Invoke-AzJson -Arguments @(
  'stack', 'group', 'show',
  '--subscription', $resolvedSubscriptionId,
  '--resource-group', $imagesResourceGroupName,
  '--name', $imagesResourceGroupStackName
)

$imagesOutputs = Get-DeploymentOutputs -DeploymentResult $imagesDeployment
$resolvedContainerRegistryName = Get-StringOutputValue -Outputs $imagesOutputs -Name 'containerRegistryName'
$resolvedContainerRegistryLoginServer = Get-StringOutputValue -Outputs $imagesOutputs -Name 'containerRegistryLoginServer'

if (-not $resolvedContainerRegistryName) {
  $resolvedContainerRegistryName = $containerRegistryName
}

if (-not $resolvedContainerRegistryLoginServer) {
  throw 'Container registry login server was not returned from the shared images deployment.'
}

$imageReference = "$resolvedContainerRegistryLoginServer/${WebImageRepository}:$resolvedImageTag"
$bffImageReference = if ($resolvedBffDeploymentEnabled) {
  "$resolvedContainerRegistryLoginServer/${BffImageRepository}:$resolvedImageTag"
} else {
  ''
}

$monitoringBootstrapArguments = @(
  'stack', 'group', 'create',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--name', $platformMonitoringStackName,
  '--resource-group', $platformMonitorResourceGroupName,
  '--template-file', $WebMonitoringTemplateFile,
  '--parameters', "environmentName=$EnvironmentName",
  '--parameters', "organizationShortName=$($configuration.organizationShortName)",
  '--parameters', "workloadShortName=$($configuration.workloadShortName)",
  '--parameters', "regionShortName=$($configuration.primaryRegionShortName)",
  '--parameters', "ownerTag=vc4u2c",
  '--parameters', "costCenterTag=playg",
  '--parameters', "telemetryServiceName=acme-los-web",
  '--action-on-unmanage', 'deleteResources',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS platform monitoring stack for $EnvironmentName",
  '--yes'
)

Invoke-AzNoOutput -Arguments $monitoringBootstrapArguments
$monitoringBootstrapDeployment = Invoke-AzJson -Arguments @(
  'stack', 'group', 'show',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--resource-group', $platformMonitorResourceGroupName,
  '--name', $platformMonitoringStackName
)
$monitoringBootstrapOutputs = Get-DeploymentOutputs -DeploymentResult $monitoringBootstrapDeployment
$platformLogAnalyticsWorkspaceName = Get-StringOutputValue -Outputs $monitoringBootstrapOutputs -Name 'logAnalyticsWorkspaceName'
$platformLogAnalyticsWorkspaceId = Get-StringOutputValue -Outputs $monitoringBootstrapOutputs -Name 'logAnalyticsWorkspaceId'
$platformApplicationInsightsName = Get-StringOutputValue -Outputs $monitoringBootstrapOutputs -Name 'appInsightsName'
$platformApplicationInsightsId = Get-StringOutputValue -Outputs $monitoringBootstrapOutputs -Name 'appInsightsId'
$platformApplicationInsightsConnectionString = Get-StringOutputValue -Outputs $monitoringBootstrapOutputs -Name 'applicationInsightsConnectionString'

if (-not $platformLogAnalyticsWorkspaceName -or -not $platformLogAnalyticsWorkspaceId) {
  throw 'Platform Log Analytics workspace outputs were not returned from the monitoring deployment.'
}

if (-not $platformApplicationInsightsId -or -not $platformApplicationInsightsConnectionString) {
  throw 'Platform Application Insights outputs were not returned from the monitoring deployment.'
}

$webDeploymentArguments += @('--parameters', "platformLogAnalyticsWorkspaceName=$platformLogAnalyticsWorkspaceName")

Invoke-AzNoOutput -Arguments $webDeploymentArguments
$webDeployment = Invoke-AzJson -Arguments @(
  'stack', 'group', 'show',
  '--subscription', $resolvedSubscriptionId,
  '--resource-group', $resourceGroupName,
  '--name', $resourceGroupStackName
)
$outputs = Get-DeploymentOutputs -DeploymentResult $webDeployment
$workloadVirtualNetworkId = Get-StringOutputValue -Outputs $outputs -Name 'workloadVirtualNetworkId'

if (-not $workloadVirtualNetworkId) {
  throw 'Workload virtual network id was not returned from the workload deployment.'
}

$managedEnvironmentId = Get-StringOutputValue -Outputs $outputs -Name 'containerAppEnvironmentId'
$resolvedContainerAppName = Get-StringOutputValue -Outputs $outputs -Name 'containerAppName'
$userAssignedIdentityResourceId = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityResourceId'
$userAssignedIdentityClientId = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityClientId'
$keyVaultName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultName'
$keyVaultUri = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultUri'
$redisDatabaseId = Get-StringOutputValue -Outputs $outputs -Name 'redisDatabaseId'
$redisHostName = Get-StringOutputValue -Outputs $outputs -Name 'redisHostName'
$redisPort = Get-IntegerOutputValue -Outputs $outputs -Name 'redisPort'

if (-not $resolvedContainerAppName) {
  throw 'Container app name was not returned from the workload deployment.'
}

if (-not $userAssignedIdentityClientId) {
  throw 'User-assigned identity client id was not returned from the workload deployment.'
}

$managedEnvironmentDefaultDomain = Invoke-AzTsv -Arguments @(
  'containerapp', 'env', 'show',
  '--ids', $managedEnvironmentId,
  '--query', 'properties.defaultDomain',
  '--output', 'tsv'
)

if (-not $managedEnvironmentDefaultDomain) {
  throw 'Container Apps environment default domain was not returned by Azure.'
}

$resolvedContainerAppBaseUrl = "https://$resolvedContainerAppName.$managedEnvironmentDefaultDomain"
$resolvedBffContainerAppName = if ($resolvedBffDeploymentEnabled) {
  Get-BffContainerAppName -Configuration $configuration -EnvironmentName $EnvironmentName
} else {
  ''
}
$resolvedBffContainerAppBaseUrl = if ($resolvedBffDeploymentEnabled) {
  "https://$resolvedBffContainerAppName.internal.$managedEnvironmentDefaultDomain"
} else {
  ''
}
$bffTrustedProxySecretValue = if ($resolvedBffDeploymentEnabled) {
  New-SecureRandomBase64Url
} else {
  ''
}
$oktaEnvironmentName = if ($environmentConfiguration.oktaEnvironmentName) {
  [string]$environmentConfiguration.oktaEnvironmentName
} else {
  $EnvironmentName
}
$webSessionSecretValue = New-SecureRandomBase64Url
$oktaEnvironment = Get-OktaEnvironmentConfiguration -RepositoryRoot $repositoryRoot -OktaEnvironmentName $oktaEnvironmentName
$configuredDeployedWebBaseUrl = Resolve-DeployedWebBaseUrl -WebConfiguration $oktaEnvironment.web

if (
  $configuredDeployedWebBaseUrl -and
  ($configuredDeployedWebBaseUrl.TrimEnd('/') -ne $resolvedContainerAppBaseUrl.TrimEnd('/'))
) {
  Write-Warning "Okta environment '$oktaEnvironmentName' deployed base URL '$configuredDeployedWebBaseUrl' does not match the current ACA public URL '$resolvedContainerAppBaseUrl'. The deployed container will use the ACA public URL. Update infra/okta/environments/$oktaEnvironmentName.json and rerun okta:bootstrap for this environment."
}

$oktaIssuer = Get-OptionalString $oktaEnvironment.okta.issuer
$oktaClientId = Get-OptionalString $oktaEnvironment.okta.webClientId
$oktaFundingAcrValues = Get-OptionalString $oktaEnvironment.okta.fundingStepUpAcrValues
$oktaRedirectPath = Get-OptionalString $oktaEnvironment.web.redirectPath
$oktaPostLogoutRedirectPath = Get-OptionalString $oktaEnvironment.web.postLogoutRedirectPath

if (-not $oktaIssuer -or -not $oktaClientId -or -not $oktaRedirectPath -or -not $oktaPostLogoutRedirectPath) {
  throw "Okta environment '$oktaEnvironmentName' is missing required web auth settings."
}

$resolvedOktaRedirectUri = Join-AbsoluteUrl -BaseUrl $resolvedContainerAppBaseUrl -Path $oktaRedirectPath
$resolvedOktaPostLogoutRedirectUri = Join-AbsoluteUrl -BaseUrl $resolvedContainerAppBaseUrl -Path $oktaPostLogoutRedirectPath

if (-not (Test-ContainerRegistryTagExists -SubscriptionId $resolvedSubscriptionId -RegistryName $resolvedContainerRegistryName -RepositoryName $WebImageRepository -Tag $resolvedImageTag)) {
  $containerBuildContextPath = New-ContainerBuildContext -RepositoryRoot $repositoryRoot

  try {
    az acr build `
      --subscription $resolvedSubscriptionId `
      --registry $resolvedContainerRegistryName `
      --image "${WebImageRepository}:$resolvedImageTag" `
      --file apps/web-app/Dockerfile `
      --build-arg "NEXT_PUBLIC_APP_ENVIRONMENT=$($environmentConfiguration.appEnvironmentName)" `
      --build-arg "NEXT_PUBLIC_APP_BUILD=$resolvedBuildId" `
      --build-arg 'NEXT_PUBLIC_AUTH_PROVIDER=okta' `
      --build-arg "NEXT_PUBLIC_OKTA_ENVIRONMENT=$oktaEnvironmentName" `
      --build-arg "NEXT_PUBLIC_OKTA_ISSUER=$oktaIssuer" `
      --build-arg "NEXT_PUBLIC_OKTA_CLIENT_ID=$oktaClientId" `
      --build-arg "NEXT_PUBLIC_OKTA_REDIRECT_URI=$resolvedOktaRedirectUri" `
      --build-arg "NEXT_PUBLIC_OKTA_POST_LOGOUT_REDIRECT_URI=$resolvedOktaPostLogoutRedirectUri" `
      --build-arg "NEXT_PUBLIC_OKTA_FUNDING_ACR_VALUES=$oktaFundingAcrValues" `
      --no-logs `
      --only-show-errors `
      $containerBuildContextPath `
      --output none

    if ($LASTEXITCODE -ne 0) {
      throw "ACR build failed for image '${WebImageRepository}:$resolvedImageTag'."
    }
  } finally {
    Remove-Item -LiteralPath $containerBuildContextPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($resolvedBffDeploymentEnabled -and -not (Test-ContainerRegistryTagExists -SubscriptionId $resolvedSubscriptionId -RegistryName $resolvedContainerRegistryName -RepositoryName $BffImageRepository -Tag $resolvedImageTag)) {
  $containerBuildContextPath = New-ContainerBuildContext -RepositoryRoot $repositoryRoot

  try {
    az acr build `
      --subscription $resolvedSubscriptionId `
      --registry $resolvedContainerRegistryName `
      --image "${BffImageRepository}:$resolvedImageTag" `
      --file apps/bff-api/Dockerfile `
      --no-logs `
      --only-show-errors `
      $containerBuildContextPath `
      --output none

    if ($LASTEXITCODE -ne 0) {
      throw "ACR build failed for image '${BffImageRepository}:$resolvedImageTag'."
    }
  } finally {
    Remove-Item -LiteralPath $containerBuildContextPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$platformWorkloadLinksDeploymentArguments = @(
  'stack', 'group', 'create',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--name', $platformWorkloadLinksStackName,
  '--resource-group', $platformNetworkResourceGroupName,
  '--template-file', $PlatformWorkloadLinksTemplateFile,
  '--parameters', "environmentName=$EnvironmentName", "workloadVirtualNetworkId=$workloadVirtualNetworkId",
  '--action-on-unmanage', 'deleteResources',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS platform DNS link stack for $EnvironmentName workload networking",
  '--yes'
)

Invoke-AzNoOutput -Arguments $platformWorkloadLinksDeploymentArguments
$platformWorkloadLinksDeployment = Invoke-AzJson -Arguments @(
  'stack', 'group', 'show',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--resource-group', $platformNetworkResourceGroupName,
  '--name', $platformWorkloadLinksStackName
)
$platformOutputs = Get-DeploymentOutputs -DeploymentResult $platformWorkloadLinksDeployment

$runtimeDeploymentArguments = @(
  'deployment', 'group', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--resource-group', $resourceGroupName,
  '--name', "runtime-$EnvironmentName",
  '--template-file', $WebRuntimeTemplateFile,
  '--parameters', "environmentName=$EnvironmentName",
  '--parameters', "organizationShortName=$($configuration.organizationShortName)",
  '--parameters', "workloadShortName=$($configuration.workloadShortName)",
  '--parameters', "regionShortName=$($configuration.primaryRegionShortName)",
  '--parameters', "ownerTag=vc4u2c",
  '--parameters', "costCenterTag=playg",
  '--parameters', "containerRegistryLoginServer=$resolvedContainerRegistryLoginServer",
  '--parameters', "containerImage=$imageReference",
  '--parameters', "managedEnvironmentId=$managedEnvironmentId",
  '--parameters', "userAssignedIdentityResourceId=$userAssignedIdentityResourceId",
  '--parameters', "userAssignedIdentityClientId=$userAssignedIdentityClientId",
  '--parameters', "appBuildId=$resolvedBuildId",
  '--parameters', "authProvider=okta",
  '--parameters', "oktaEnvironmentName=$oktaEnvironmentName",
  '--parameters', "oktaIssuer=$oktaIssuer",
  '--parameters', "oktaClientId=$oktaClientId",
  '--parameters', "oktaRedirectUri=$resolvedOktaRedirectUri",
  '--parameters', "oktaPostLogoutRedirectUri=$resolvedOktaPostLogoutRedirectUri",
  '--parameters', "oktaFundingAcrValues=$oktaFundingAcrValues",
  '--parameters', "sessionSecretValue=$webSessionSecretValue",
  '--parameters', "applicationInsightsConnectionString=$platformApplicationInsightsConnectionString",
  '--parameters', "logAnalyticsWorkspaceId=$platformLogAnalyticsWorkspaceId",
  '--parameters', "keyVaultName=$keyVaultName",
  '--parameters', "keyVaultUri=$keyVaultUri",
  '--parameters', "minReplicas=$runtimeMinReplicas",
  '--parameters', "maxReplicas=$runtimeMaxReplicas",
  '--output', 'json'
)

$runtimeDeploymentArguments += @('--parameters', "stateStoreMode=$resolvedStateStoreMode")

if ($resolvedBffDeploymentEnabled) {
  $runtimeDeploymentArguments += @(
    '--parameters', "bffContainerImage=$bffImageReference",
    '--parameters', "bffBaseUrl=$resolvedBffContainerAppBaseUrl",
    '--parameters', "bffVersion=$resolvedBffVersion",
    '--parameters', "bffTrustedProxySecretValue=$bffTrustedProxySecretValue",
    '--parameters', "bffMinReplicas=$bffRuntimeMinReplicas",
    '--parameters', "bffMaxReplicas=$bffRuntimeMaxReplicas"
  )
}

if ($resolvedStateStoreMode -eq 'redis') {
  if (-not $redisDatabaseId) {
    throw 'Redis database id was not returned from the workload deployment.'
  }

  if (-not $keyVaultName) {
    throw 'Key Vault name was not returned from the workload deployment.'
  }

  if (-not $redisHostName) {
    throw 'Redis host name was not returned from the workload deployment.'
  }

  if ($redisPort -le 0) {
    throw 'Redis port was not returned from the workload deployment.'
  }

  $runtimeDeploymentArguments += @(
    '--parameters', "redisHostName=$redisHostName",
    '--parameters', "redisPort=$redisPort"
  )
}

$runtimeDeployment = Invoke-AzJson -Arguments $runtimeDeploymentArguments
$runtimeOutputs = Get-DeploymentOutputs -DeploymentResult $runtimeDeployment
$deployedBffContainerAppName = Get-StringOutputValue -Outputs $runtimeOutputs -Name 'bffContainerAppName'
$deployedBffContainerAppBaseUrl = Get-StringOutputValue -Outputs $runtimeOutputs -Name 'bffContainerAppBaseUrl'
$deployedBffContainerAppLatestRevisionFqdn = Get-StringOutputValue -Outputs $runtimeOutputs -Name 'bffContainerAppLatestRevisionFqdn'

$monitoringDeploymentArguments = @(
  'stack', 'group', 'create',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--name', $platformMonitoringStackName,
  '--resource-group', $platformMonitorResourceGroupName,
  '--template-file', $WebMonitoringTemplateFile,
  '--parameters', "environmentName=$EnvironmentName",
  '--parameters', "organizationShortName=$($configuration.organizationShortName)",
  '--parameters', "workloadShortName=$($configuration.workloadShortName)",
  '--parameters', "regionShortName=$($configuration.primaryRegionShortName)",
  '--parameters', "ownerTag=vc4u2c",
  '--parameters', "costCenterTag=playg",
  '--parameters', "containerAppResourceId=$(Get-StringOutputValue -Outputs $runtimeOutputs -Name 'containerAppId')",
  '--parameters', "containerAppEnvironmentResourceId=$(Get-StringOutputValue -Outputs $outputs -Name 'containerAppEnvironmentId')",
  '--parameters', "keyVaultResourceId=$(Get-StringOutputValue -Outputs $outputs -Name 'keyVaultId')",
  '--parameters', "keyVaultUri=$(Get-StringOutputValue -Outputs $outputs -Name 'keyVaultUri')",
  '--parameters', "telemetryServiceName=acme-los-web",
  '--action-on-unmanage', 'deleteResources',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS platform monitoring stack for $EnvironmentName",
  '--yes'
)

Invoke-AzNoOutput -Arguments $monitoringDeploymentArguments
$monitoringDeployment = Invoke-AzJson -Arguments @(
  'stack', 'group', 'show',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--resource-group', $platformMonitorResourceGroupName,
  '--name', $platformMonitoringStackName
)
$monitoringOutputs = Get-DeploymentOutputs -DeploymentResult $monitoringDeployment
$workbookResourceName = Get-StringOutputValue -Outputs $monitoringOutputs -Name 'workbookResourceName'
$workbookDisplayName = Get-StringOutputValue -Outputs $monitoringOutputs -Name 'workbookDisplayName'

if ($workbookResourceName -and $workbookDisplayName) {
  & $WorkbookSyncScriptFile `
    -PlatformSubscriptionId $resolvedPlatformSubscriptionId `
    -PlatformMonitorResourceGroupName $platformMonitorResourceGroupName `
    -WorkbookResourceName $workbookResourceName `
    -WorkbookDisplayName $workbookDisplayName `
    -ApplicationInsightsResourceId $platformApplicationInsightsId `
    -WorkspaceResourceId $platformLogAnalyticsWorkspaceId `
    -ContainerAppResourceId (Get-StringOutputValue -Outputs $runtimeOutputs -Name 'containerAppId') `
    -ContainerAppEnvironmentResourceId (Get-StringOutputValue -Outputs $outputs -Name 'containerAppEnvironmentId') `
    -KeyVaultResourceId (Get-StringOutputValue -Outputs $outputs -Name 'keyVaultId') `
    -KeyVaultUri (Get-StringOutputValue -Outputs $outputs -Name 'keyVaultUri') `
    -RedisResourceId (Get-StringOutputValue -Outputs $outputs -Name 'redisClusterId') `
    -RedisName (Get-StringOutputValue -Outputs $outputs -Name 'redisClusterName') `
    -TelemetryServiceName 'acme-los-web' `
    -Location $Location | Out-Null
}

Remove-Item -LiteralPath $compiledParameterFile -Force -ErrorAction SilentlyContinue

[ordered]@{
  environmentName = $EnvironmentName
  stateStoreMode = $resolvedStateStoreMode
  redisAuthMode = if ($resolvedStateStoreMode -eq 'redis') { 'entra' } else { '' }
  subscriptionId = $resolvedSubscriptionId
  platformSubscriptionId = $resolvedPlatformSubscriptionId
  tenantId = $resolvedTenantId
  resourceGroupName = $resourceGroupName
  subscriptionStackName = $subscriptionStackName
  resourceGroupStackName = $resourceGroupStackName
  platformNetworkResourceGroupName = $platformNetworkResourceGroupName
  platformMonitorResourceGroupName = $platformMonitorResourceGroupName
  platformWorkloadLinksStackName = $platformWorkloadLinksStackName
  platformMonitoringStackName = $platformMonitoringStackName
  imagesSubscriptionRole = $imagesSubscriptionRole
  imagesResourceGroupName = $imagesResourceGroupName
  imagesSubscriptionStackName = $imagesSubscriptionStackName
  imagesResourceGroupStackName = $imagesResourceGroupStackName
  containerRegistryName = $resolvedContainerRegistryName
  containerRegistryLoginServer = $resolvedContainerRegistryLoginServer
  webImageRepository = $WebImageRepository
  bffDeploymentMode = $BffDeploymentMode
  bffEnabled = $resolvedBffDeploymentEnabled
  bffImageRepository = $BffImageRepository
  bffVersion = $resolvedBffVersion
  imageTag = $resolvedImageTag
  appBuildId = $resolvedBuildId
  imageReference = $imageReference
  bffImageReference = $bffImageReference
  containerAppEnvironmentName = Get-StringOutputValue -Outputs $outputs -Name 'containerAppEnvironmentName'
  containerAppName = Get-StringOutputValue -Outputs $runtimeOutputs -Name 'containerAppName'
  containerAppBaseUrl = $resolvedContainerAppBaseUrl
  containerAppLatestRevisionFqdn = Get-StringOutputValue -Outputs $runtimeOutputs -Name 'containerAppLatestRevisionFqdn'
  bffContainerAppName = $deployedBffContainerAppName
  bffContainerAppBaseUrl = $deployedBffContainerAppBaseUrl
  bffContainerAppLatestRevisionFqdn = $deployedBffContainerAppLatestRevisionFqdn
  userAssignedIdentityName = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityName'
  userAssignedIdentityClientId = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityClientId'
  workloadVirtualNetworkName = Get-StringOutputValue -Outputs $outputs -Name 'workloadVirtualNetworkName'
  workloadVirtualNetworkId = $workloadVirtualNetworkId
  appSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'appSubnetName'
  dataSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'dataSubnetName'
  acaInfrastructureSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'acaInfrastructureSubnetName'
  privateEndpointSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'privateEndpointSubnetName'
  keyVaultName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultName'
  keyVaultPrivateEndpointName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultPrivateEndpointName'
  keyVaultPrivateEndpointNetworkInterfaceName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultPrivateEndpointNetworkInterfaceName'
  applicationInsightsName = $platformApplicationInsightsName
  applicationInsightsId = $platformApplicationInsightsId
  logAnalyticsWorkspaceName = $platformLogAnalyticsWorkspaceName
  logAnalyticsWorkspaceId = $platformLogAnalyticsWorkspaceId
  redisClusterName = Get-StringOutputValue -Outputs $outputs -Name 'redisClusterName'
  managedRedisPrivateEndpointName = Get-StringOutputValue -Outputs $outputs -Name 'managedRedisPrivateEndpointName'
  managedRedisPrivateEndpointNetworkInterfaceName = Get-StringOutputValue -Outputs $outputs -Name 'managedRedisPrivateEndpointNetworkInterfaceName'
  redisDatabaseName = Get-StringOutputValue -Outputs $outputs -Name 'redisDatabaseName'
  redisHostName = Get-StringOutputValue -Outputs $outputs -Name 'redisHostName'
  redisPort = Get-IntegerOutputValue -Outputs $outputs -Name 'redisPort'
  keyVaultDnsLinkName = Get-StringOutputValue -Outputs $platformOutputs -Name 'keyVaultVirtualNetworkLinkName'
  managedRedisDnsLinkName = Get-StringOutputValue -Outputs $platformOutputs -Name 'managedRedisVirtualNetworkLinkName'
  workbookDisplayName = $workbookDisplayName
  workbookResourceName = $workbookResourceName
} | ConvertTo-Json -Depth 5
