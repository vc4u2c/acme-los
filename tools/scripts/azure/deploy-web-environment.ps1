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
  [switch]$ReuseExistingImages,
  [string]$WebImageDigest,
  [string]$BffImageDigest,
  [string]$RecoverRetiredResourceGroup,
  [switch]$SyncPublicDns,
  [string]$ConfirmDnsZone,
  [ValidateSet('auto', 'enabled', 'disabled')]
  [string]$BffDeploymentMode = 'auto',
  [string]$ConfigurationPath,
  [string]$ParameterFile,
  [string]$WorkloadTemplateFile,
  [string]$WebTemplateFile,
  [string]$WebRuntimeTemplateFile,
  [string]$EntraServiceAuthTemplateFile,
  [string]$WebMonitoringTemplateFile,
  [string]$PlatformWorkloadLinksTemplateFile,
  [string]$ImagesSubscriptionTemplateFile,
  [string]$ImagesResourceTemplateFile,
  [string]$WorkbookSyncScriptFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'runtime-region.ps1')

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

if (-not $EntraServiceAuthTemplateFile) {
  $EntraServiceAuthTemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\main.entra.service-auth.rg.bicep'
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

function Get-OptionalPropertyValue {
  param(
    $InputObject,
    [string]$Name
  )

  if ($null -eq $InputObject) {
    return $null
  }

  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }

  return $property.Value
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
  param([string[]]$Arguments, [switch]$Sensitive)

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
  $stderrPath = [IO.Path]::GetTempFileName()
  try {
    $previousErrorPreference = $ErrorActionPreference
    try {
      # Windows PowerShell otherwise throws on native stderr before redaction.
      $ErrorActionPreference = 'Continue'
      $commandOutput = az @resolvedArgumentsArray 2> $stderrPath
      $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorPreference }
    if ($exitCode -ne 0) {
      $errorMessage = [string]::Join([Environment]::NewLine, @($commandOutput)) + [IO.File]::ReadAllText($stderrPath)
      $failure = [InvalidOperationException]::new("Azure CLI command failed: az $($Arguments -join ' ')`n$errorMessage")
      # PowerShell 5 wraps native stderr with stack traces, so preserve the ARM code before throwing.
      $failure.Data['AzureResourceNotFound'] = $errorMessage -match '\((ResourceNotFound|ParentResourceNotFound|ResourceGroupNotFound)\)|"code"\s*:\s*"(ResourceNotFound|ParentResourceNotFound|ResourceGroupNotFound)"'
      throw $failure
    }
    if ($null -eq $commandOutput) { return $null }
    $jsonPayload = [string]::Join([Environment]::NewLine, $commandOutput)
    if ([string]::IsNullOrWhiteSpace($jsonPayload)) { return $null }
    return $jsonPayload | ConvertFrom-Json
  } catch {
    if ($Sensitive) { throw 'Azure runtime deployment failed. Secret-bearing arguments and provider output were suppressed; inspect the deployment in Azure.' }
    throw
  } finally {
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-AzNoOutput {
  param([string[]]$Arguments)
  Invoke-AzJson -Arguments $Arguments | Out-Null
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

function Test-KeyVaultSecretExists {
  param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName,
    [string]$VaultName,
    [string]$SecretName
  )

  if ([string]::IsNullOrWhiteSpace($ResourceGroupName) -or [string]::IsNullOrWhiteSpace($VaultName) -or [string]::IsNullOrWhiteSpace($SecretName)) {
    return $false
  }

  $secretResourceId = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName/providers/Microsoft.KeyVault/vaults/$VaultName/secrets/$SecretName"
  return $null -ne (Get-ConnectivityResource $secretResourceId '2023-07-01')
}

function Set-KeyVaultSecretFromValue {
  param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName,
    [string]$VaultName,
    [string]$SecretName,
    [string]$SecretValue,
    [string]$TemplateFile
  )

  if ([string]::IsNullOrWhiteSpace($SecretValue)) {
    return
  }

  if (-not $TemplateFile) {
    $TemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\modules\security\key-vault-secret.bicep'
  }

  $parameterFilePath = Join-Path ([System.IO.Path]::GetTempPath()) ("acme-los-kv-secret-parameters-" + [guid]::NewGuid().ToString('N') + '.json')
  $parameterPayload = @{
    '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
    contentVersion = '1.0.0.0'
    parameters = @{
      vaultName = @{
        value = $VaultName
      }
      secretName = @{
        value = $SecretName
      }
      secretValue = @{
        value = $SecretValue
      }
    }
  } | ConvertTo-Json -Depth 10

  [System.IO.File]::WriteAllText($parameterFilePath, $parameterPayload, [System.Text.Encoding]::UTF8)

  $deploymentName = "kv-secret-$SecretName"
  if ($deploymentName.Length -gt 64) {
    $deploymentName = "kv-secret-$([guid]::NewGuid().ToString('N').Substring(0, 24))"
  }

  try {
    Invoke-AzJson -Sensitive -Arguments @(
      'deployment', 'group', 'create',
      '--subscription', $SubscriptionId,
      '--resource-group', $ResourceGroupName,
      '--name', $deploymentName,
      '--template-file', $TemplateFile,
      '--parameters', "@$parameterFilePath",
      '--output', 'none'
    )
  } finally {
    Remove-Item -LiteralPath $parameterFilePath -Force -ErrorAction SilentlyContinue
  }
}

function Get-WorkloadResourceGroupName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return Get-WebRuntimeResourceGroupName $Configuration $EnvironmentName
}

function Get-SubscriptionStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$((Get-WebRuntimeRegion $Configuration $EnvironmentName).ShortName)-01".ToLowerInvariant()
}

function Get-ResourceGroupStackName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-app-$EnvironmentName-$((Get-WebRuntimeRegion $Configuration $EnvironmentName).ShortName)-01".ToLowerInvariant()
}

function Get-BffContainerAppName {
  param(
    $Configuration,
    [string]$EnvironmentName
  )

  return "ca-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-bff-$EnvironmentName-$((Get-WebRuntimeRegion $Configuration $EnvironmentName).ShortName)-01".ToLowerInvariant()
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

  return "stk-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-dns-links-$EnvironmentName-$((Get-WebRuntimeRegion $Configuration $EnvironmentName).ShortName)-01".ToLowerInvariant()
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
    'bin',
    'dist',
    'node_modules',
    'obj',
    'playwright-report',
    'test-results',
    'tmp',
    '.tmp-dotnet',
    'artifacts',
    'web-build'
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

function Get-AnalyticsEnvironmentConfiguration {
  param(
    [string]$RepositoryRoot,
    [string]$AnalyticsEnvironmentName
  )

  $environmentPath = Join-Path $RepositoryRoot "infra\analytics\environments\$AnalyticsEnvironmentName.json"
  if (-not (Test-Path -LiteralPath $environmentPath)) {
    throw "Analytics environment file '$environmentPath' was not found."
  }

  return Get-JsonFile -Path $environmentPath
}

function Get-StringOrDefault {
  param(
    $Value,
    [string]$DefaultValue = ''
  )

  $optional = Get-OptionalString $Value
  if ($optional) {
    return $optional
  }

  return $DefaultValue
}

function ConvertTo-Boolean {
  param($Value)

  if ($Value -is [bool]) {
    return [bool]$Value
  }

  if ($Value -is [string]) {
    return @('1', 'true', 'yes', 'on') -contains $Value.Trim().ToLowerInvariant()
  }

  return $false
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

if (-not (Test-Path -LiteralPath $EntraServiceAuthTemplateFile)) {
  throw "Entra service-auth template '$EntraServiceAuthTemplateFile' was not found."
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
$runtimeRegion = Get-WebRuntimeRegion $configuration $EnvironmentName
if ($PSBoundParameters.ContainsKey('Location') -and $Location -cne $runtimeRegion.Location) { throw 'Location must match the source-owned runtime region.' }
$Location = $runtimeRegion.Location
$foundationResourceGroupName = "rg-$($configuration.organizationShortName)-$($configuration.workloadShortName)-web-$EnvironmentName-$($configuration.primaryRegionShortName)-01"
$preserveFoundation = [bool]$RecoverRetiredResourceGroup -or $runtimeRegion.Relocated
$account = az account show --output json | ConvertFrom-Json
$resolvedSubscriptionId = if ($SubscriptionId) { $SubscriptionId } else { Resolve-SubscriptionIdFromConfiguration -Configuration $configuration -EnvironmentName $EnvironmentName }
. (Join-Path $PSScriptRoot 'private-connectivity.ps1')
$resourceGroupName = Get-WorkloadResourceGroupName -Configuration $configuration -EnvironmentName $EnvironmentName
if ($RecoverRetiredResourceGroup -and ($EnvironmentName -cne 'dev' -or $RecoverRetiredResourceGroup -cne $resourceGroupName -or -not $ReuseExistingImages -or -not $SyncPublicDns)) { throw 'Retirement recovery requires dev, the exact resource group, pinned images, and DNS synchronization.' }
if ($RecoverRetiredResourceGroup -and ($env:ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION -or $env:ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM)) { throw 'Clear secret-rotation environment variables before recovery.' }
Assert-WebEnvironmentNotHibernated $resolvedSubscriptionId $foundationResourceGroupName -RecoverRetired:([bool]$RecoverRetiredResourceGroup) -ExpectedRuntimeRegion $runtimeRegion.ShortName
if ($runtimeRegion.Relocated -and -not $RecoverRetiredResourceGroup) {
  $runtimeGroup = Invoke-AzJson -Arguments @('group', 'show', '--subscription', $resolvedSubscriptionId, '--name', $resourceGroupName)
  if ($runtimeGroup.tags.'acme:application' -cne 'acme-los' -or $runtimeGroup.tags.'acme:environment' -cne 'dev') { throw 'Regional runtime must be initialized by the retirement rebuild command.' }
  Assert-WebEnvironmentNotHibernated $resolvedSubscriptionId $resourceGroupName
}
. (Join-Path $PSScriptRoot 'public-domain.ps1')
$publicDomainConfiguration = Assert-WebPublicDomainConfiguration $configuration $EnvironmentName -SyncPublicDns:$SyncPublicDns -ConfirmDnsZone $ConfirmDnsZone
$resolvedPlatformSubscriptionId = if ($PlatformSubscriptionId) { $PlatformSubscriptionId } else { Resolve-PlatformSubscriptionIdFromConfiguration -Configuration $configuration }
if ($SyncPublicDns) {
  . (Join-Path $PSScriptRoot 'azure-dns.ps1')
  $dns = Get-AzureWebDnsConfiguration $configuration $EnvironmentName $resolvedPlatformSubscriptionId
  Assert-AzureWebDnsDelegation $dns (Get-AzureWebDnsZone $dns)
}
$resolvedTenantId = if ($TenantId) { $TenantId } else { $account.tenantId }
$resolvedImageTag = Get-ResolvedImageTag -ExplicitTag $ImageTag -EnvironmentName $EnvironmentName
$resolvedBuildId = Get-ResolvedBuildId -ExplicitTag $ImageTag
$resolvedStateStoreMode = if ($StateStoreMode) { $StateStoreMode } else { 'redis' }
$resolvedBffDeploymentEnabled = $BffDeploymentMode -eq 'enabled' -or (
  $BffDeploymentMode -eq 'auto' -and $EnvironmentName -eq 'dev'
)
$imagesSubscriptionRole = Get-ImagesSubscriptionRole -Configuration $configuration -EnvironmentName $EnvironmentName
$networkConfiguration = Get-EnvironmentNetworkConfiguration -Configuration $configuration -EnvironmentName $EnvironmentName
$runtimeConfiguration = Get-OptionalPropertyValue -InputObject $environmentConfiguration -Name 'runtime'
$runtimeMinReplicaConfiguration = Get-OptionalPropertyValue -InputObject $runtimeConfiguration -Name 'minReplicas'
$runtimeMaxReplicaConfiguration = Get-OptionalPropertyValue -InputObject $runtimeConfiguration -Name 'maxReplicas'
$runtimeMinReplicas = if ($null -ne $runtimeMinReplicaConfiguration) {
  [int]$runtimeMinReplicaConfiguration
} else {
  0
}
$runtimeMaxReplicas = if ($null -ne $runtimeMaxReplicaConfiguration) {
  [int]$runtimeMaxReplicaConfiguration
} else {
  1
}
$smsMfaConfiguration = Get-OptionalPropertyValue -InputObject $environmentConfiguration -Name 'smsMfa'
$smsMfaEnabled = ConvertTo-Boolean (
  Get-OptionalPropertyValue -InputObject $smsMfaConfiguration -Name 'enabled'
)
$smsMfaEnabledEnvValue = if ($smsMfaEnabled) { 'true' } else { 'false' }
$smsMfaProvider = (Get-StringOrDefault -Value (
    Get-OptionalPropertyValue -InputObject $smsMfaConfiguration -Name 'provider'
  ) -DefaultValue 'acs').ToLowerInvariant()
$smsMfaMockOtpEnabled = ConvertTo-Boolean (
  Get-OptionalPropertyValue -InputObject $smsMfaConfiguration -Name 'enableMockOtp'
)
$smsMfaMockOtpEnabledEnvValue = if ($smsMfaMockOtpEnabled) { 'true' } else { 'false' }
$smsSenderPhoneNumber = Get-StringOrDefault -Value (
  Get-OptionalPropertyValue -InputObject $smsMfaConfiguration -Name 'senderPhoneNumber'
)
$oktaTelephonyHookAuthorizationSecretName = 'sec-acme-los-okta-telephony-hook-authorization'
$oktaTelephonyHookAuthorizationSecretValue = Get-OptionalString $env:ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION
$oktaCustomerIdWritebackConfiguration = Get-OptionalPropertyValue -InputObject $environmentConfiguration -Name 'oktaCustomerIdWriteback'
$oktaAccountProfileSyncConfiguration = Get-OptionalPropertyValue -InputObject $environmentConfiguration -Name 'oktaAccountProfileSync'
$oktaEmailLoginSyncEnabled = ConvertTo-Boolean (
  Get-OptionalPropertyValue -InputObject $oktaAccountProfileSyncConfiguration -Name 'emailLoginSyncEnabled'
)
$oktaCustomerIdWritebackMode = Get-StringOrDefault -Value (
  Get-OptionalPropertyValue -InputObject $oktaCustomerIdWritebackConfiguration -Name 'mode'
) -DefaultValue 'disabled'
$oktaManagementClientId = Get-StringOrDefault -Value (
  Get-OptionalPropertyValue -InputObject $oktaAccountProfileSyncConfiguration -Name 'clientId'
) -DefaultValue (Get-StringOrDefault -Value (
    Get-OptionalPropertyValue -InputObject $oktaCustomerIdWritebackConfiguration -Name 'clientId'
  ) -DefaultValue (Get-StringOrDefault -Value $env:ACME_OKTA_MANAGEMENT_CLIENT_ID))
$oktaManagementPrivateKeyId = Get-StringOrDefault -Value (
  Get-OptionalPropertyValue -InputObject $oktaAccountProfileSyncConfiguration -Name 'privateKeyId'
) -DefaultValue (Get-StringOrDefault -Value (
    Get-OptionalPropertyValue -InputObject $oktaCustomerIdWritebackConfiguration -Name 'privateKeyId'
  ) -DefaultValue (Get-StringOrDefault -Value $env:ACME_OKTA_MANAGEMENT_PRIVATE_KEY_ID))
$oktaManagementScopes = Get-StringOrDefault -Value (
  Get-OptionalPropertyValue -InputObject $oktaAccountProfileSyncConfiguration -Name 'scopes'
) -DefaultValue (Get-StringOrDefault -Value (
    Get-OptionalPropertyValue -InputObject $oktaCustomerIdWritebackConfiguration -Name 'scopes'
  ) -DefaultValue 'okta.users.read okta.users.manage')
$oktaManagementPrivateKeySecretName = 'sec-acme-los-okta-management-private-key'
$oktaManagementPrivateKeySecretValue = Get-OptionalString $env:ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM
$bffRuntimeConfiguration = Get-OptionalPropertyValue -InputObject $environmentConfiguration -Name 'bffRuntime'
$bffRuntimeMinReplicaConfiguration = Get-OptionalPropertyValue -InputObject $bffRuntimeConfiguration -Name 'minReplicas'
$bffRuntimeMaxReplicaConfiguration = Get-OptionalPropertyValue -InputObject $bffRuntimeConfiguration -Name 'maxReplicas'
$bffRuntimeMinReplicas = if ($null -ne $bffRuntimeMinReplicaConfiguration) {
  [int]$bffRuntimeMinReplicaConfiguration
} else {
  $runtimeMinReplicas
}
$bffRuntimeMaxReplicas = if ($null -ne $bffRuntimeMaxReplicaConfiguration) {
  [int]$bffRuntimeMaxReplicaConfiguration
} else {
  $runtimeMaxReplicas
}
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$resolvedBffVersion = Get-ResolvedBffVersion -ExplicitVersion $BffVersion -RepositoryRoot $repositoryRoot -FallbackVersion $resolvedBuildId
$compiledParameterFile = New-CompiledParameterFile -SourceParameterFile $ParameterFile

Ensure-RegisteredResourceProviders -SubscriptionId $resolvedSubscriptionId -Namespaces @(
  'Microsoft.App',
  'Microsoft.Cache',
  'Microsoft.Communication',
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
  '--parameters', "environmentName=$EnvironmentName", "location=$Location", "regionShortName=$($runtimeRegion.ShortName)",
  '--action-on-unmanage', 'deleteResources',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS subscription-scope stack for $EnvironmentName web infrastructure",
  '--yes'
)

$imagesSubscriptionDeploymentArguments = @(
  'stack', 'sub', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--name', $imagesSubscriptionStackName,
  '--location', $configuration.primaryLocation,
  '--template-file', $ImagesSubscriptionTemplateFile,
  '--parameters', "subscriptionRole=$imagesSubscriptionRole", "location=$($configuration.primaryLocation)", "regionShortName=$($configuration.primaryRegionShortName)",
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
  '--parameters', "subscriptionRole=$imagesSubscriptionRole", "location=$($configuration.primaryLocation)", "regionShortName=$($configuration.primaryRegionShortName)",
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

$webDeploymentArguments += @('--parameters', "stateStoreMode=$resolvedStateStoreMode", "location=$Location", "regionShortName=$($runtimeRegion.ShortName)", "retainedRegionShortName=$($configuration.primaryRegionShortName)", "retainedResourceGroupName=$foundationResourceGroupName")
$communicationServicesNameOverride = Get-OptionalPropertyValue (Get-OptionalPropertyValue $environmentConfiguration 'smsMfa') 'resourceName'
if ($communicationServicesNameOverride) {
  if ($communicationServicesNameOverride -cnotmatch '^acs-acme-los-dev-(cus|eus)-01$' -or $EnvironmentName -cne 'dev') { throw 'Unreviewed global ACS resource name override.' }
  $webDeploymentArguments += @('--parameters', "globalCommunicationServicesName=$communicationServicesNameOverride")
}

if ($ReuseExistingImages) {
  if (-not $ImageTag -or -not $BffVersion -or -not $resolvedBffDeploymentEnabled) { throw 'Recovery requires an explicit existing image tag, BFF version, and both apps.' }
  foreach ($entry in @(@{ repository = $WebImageRepository; digest = $WebImageDigest }, @{ repository = $BffImageRepository; digest = $BffImageDigest })) {
    if ($entry.digest -cnotmatch '^sha256:[a-f0-9]{64}$') { throw 'Recovery requires both immutable image digests.' }
    $manifest = Invoke-AzJson -Arguments @('acr', 'manifest', 'show-metadata', '--subscription', $resolvedSubscriptionId, '--registry', $containerRegistryName, '--name', "$($entry.repository):$resolvedImageTag")
    if ($manifest.digest -cne $entry.digest) { throw 'Recovery image tag no longer matches its recorded immutable digest.' }
  }
}
Assert-WebEnvironmentNotHibernated $resolvedSubscriptionId $foundationResourceGroupName -RecoverRetired:([bool]$RecoverRetiredResourceGroup) -ExpectedRuntimeRegion $runtimeRegion.ShortName
# The retained resource group's recovery metadata must survive every deployment.
$existingGroups = @(ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('group', 'list', '--subscription', $resolvedSubscriptionId)))
if (-not ($existingGroups | Where-Object { $_.name -eq $resourceGroupName })) {
  Invoke-AzNoOutput -Arguments $subscriptionDeploymentArguments
}
if (($runtimeRegion.Relocated -or $configuration.primaryLocation -ceq 'eastus') -and $resolvedStateStoreMode -eq 'redis') {
  $preflightTemplate = Invoke-AzJson -Arguments @('bicep', 'build', '--file', $WebTemplateFile, '--stdout')
  $preflightParameters = (Get-Content -LiteralPath $compiledParameterFile -Raw | ConvertFrom-Json).parameters
  Assert-RegionalRedisPreflight $configuration $EnvironmentName $resolvedSubscriptionId $resourceGroupName $preflightTemplate $preflightParameters
}
if (-not $preserveFoundation) {
  Invoke-AzNoOutput -Arguments $imagesSubscriptionDeploymentArguments
  Invoke-AzNoOutput -Arguments $imagesResourceGroupDeploymentArguments
}
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
if ($ReuseExistingImages) {
  $imageReference = "$resolvedContainerRegistryLoginServer/${WebImageRepository}@$WebImageDigest"
  $bffImageReference = "$resolvedContainerRegistryLoginServer/${BffImageRepository}@$BffImageDigest"
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

$monitoringStacks = @(ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('stack', 'group', 'list', '--subscription', $resolvedPlatformSubscriptionId, '--resource-group', $platformMonitorResourceGroupName)))
if (-not ($monitoringStacks | Where-Object { $_.name -eq $platformMonitoringStackName })) {
  if ($preserveFoundation) { throw 'The retained monitoring stack is missing; recovery cannot recreate it implicitly.' }
  Invoke-AzNoOutput -Arguments $monitoringBootstrapArguments
}
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

if ($EnvironmentName -eq 'dev') {
  # Detach disposable resources before adopting them in the dedicated runtime stack.
  $retainedArguments = @($webDeploymentArguments)
  $retainedArguments[[array]::IndexOf($retainedArguments, '--action-on-unmanage') + 1] = 'detachAll'
  if ($preserveFoundation) {
    $foundationStackName = "stk-$($configuration.organizationShortName)-$($configuration.workloadShortName)-web-app-$EnvironmentName-$($configuration.primaryRegionShortName)-01"
    $retainedStack = Invoke-AzJson -Arguments @('stack', 'group', 'show', '--subscription', $resolvedSubscriptionId, '--resource-group', $foundationResourceGroupName, '--name', $foundationStackName)
    if ($retainedStack.parameters.resourcePhase.value -ne 'retained' -or $retainedStack.provisioningState -ine 'succeeded') { throw 'Recovery requires a healthy retained foundation; it never redeploys it.' }
  } else {
    Invoke-AzNoOutput -Arguments ($retainedArguments + @('--parameters', 'resourcePhase=retained'))
  }
  $resourceGroupStackName = $resourceGroupStackName -replace '-web-app-', '-web-disposable-'
  $webDeploymentArguments[[array]::IndexOf($webDeploymentArguments, '--name') + 1] = $resourceGroupStackName
  $webDeploymentArguments += @('--parameters', 'resourcePhase=disposable')
}
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
$userAssignedIdentityPrincipalId = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityPrincipalId'
$keyVaultName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultName'
$keyVaultUri = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultUri'
$communicationServicesName = Get-StringOutputValue -Outputs $outputs -Name 'communicationServicesName'
$communicationServicesEndpoint = Get-StringOutputValue -Outputs $outputs -Name 'communicationServicesEndpoint'
$redisDatabaseId = Get-StringOutputValue -Outputs $outputs -Name 'redisDatabaseId'
$redisHostName = Get-StringOutputValue -Outputs $outputs -Name 'redisHostName'
$redisPort = Get-IntegerOutputValue -Outputs $outputs -Name 'redisPort'

if (-not $resolvedContainerAppName) {
  throw 'Container app name was not returned from the workload deployment.'
}

if (-not $userAssignedIdentityClientId) {
  throw 'User-assigned identity client id was not returned from the workload deployment.'
}

if (-not $userAssignedIdentityPrincipalId) {
  throw 'User-assigned identity principal id was not returned from the workload deployment.'
}

if (-not $communicationServicesEndpoint) {
  throw 'Azure Communication Services endpoint was not returned from the workload deployment.'
}

if ($smsMfaEnabled) {
  if ($runtimeMinReplicas -lt 1) {
    throw "Environment '$EnvironmentName' enables smsMfa but runtime.minReplicas is less than 1. Keep at least one warm web replica because Okta telephony hooks have a short response window."
  }

  if ($smsMfaProvider -notin @('acs', 'mock')) {
    throw "Environment '$EnvironmentName' enables smsMfa with unsupported provider '$smsMfaProvider'. Use 'acs' or 'mock'."
  }

  if ($smsMfaProvider -eq 'mock') {
    if ($EnvironmentName -ne 'dev') {
      throw "Environment '$EnvironmentName' enables mock SMS MFA. The protected mock SMS OTP inbox is allowed only in dev."
    }

    if (-not $smsMfaMockOtpEnabled) {
      throw "Environment '$EnvironmentName' enables mock SMS MFA. Set smsMfa.enableMockOtp to true to make the dev-only OTP inbox explicit."
    }
  } elseif ($smsSenderPhoneNumber -notmatch '^\+[1-9]\d{7,14}$') {
    throw "Environment '$EnvironmentName' enables smsMfa through ACS but does not declare a valid E.164 senderPhoneNumber."
  }

  if (-not $oktaTelephonyHookAuthorizationSecretValue) {
    if (Test-KeyVaultSecretExists -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $foundationResourceGroupName -VaultName $keyVaultName -SecretName $oktaTelephonyHookAuthorizationSecretName) {
      Write-Warning "Environment '$EnvironmentName' enables smsMfa but ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION is not set. Deployment will reuse the existing Key Vault secret '$oktaTelephonyHookAuthorizationSecretName'. Set the env var only for first-time setup or rotation."
    } else {
      throw "Environment '$EnvironmentName' enables smsMfa, but ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION is not set and Key Vault secret '$oktaTelephonyHookAuthorizationSecretName' does not exist. Set the env var for first-time setup or rotation."
    }
  }

  if ($oktaTelephonyHookAuthorizationSecretValue) {
    Set-KeyVaultSecretFromValue -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $foundationResourceGroupName -VaultName $keyVaultName -SecretName $oktaTelephonyHookAuthorizationSecretName -SecretValue $oktaTelephonyHookAuthorizationSecretValue
  }
}

if ($oktaCustomerIdWritebackMode -notin @('disabled', 'sample')) {
  throw "Environment '$EnvironmentName' has unsupported oktaCustomerIdWriteback.mode '$oktaCustomerIdWritebackMode'. Use 'disabled' or 'sample'."
}

if (($oktaCustomerIdWritebackMode -eq 'sample' -or $oktaEmailLoginSyncEnabled) -and -not $resolvedBffDeploymentEnabled) {
  throw "Environment '$EnvironmentName' enables Okta profile sync, which requires BFF deployment."
}

if ($oktaCustomerIdWritebackMode -eq 'sample' -or $oktaEmailLoginSyncEnabled) {
  if (-not $resolvedBffDeploymentEnabled) {
    throw "Environment '$EnvironmentName' enables Okta profile sync, which requires BFF deployment."
  }

  if (-not $oktaManagementClientId) {
    throw "Environment '$EnvironmentName' enables Okta profile sync. Set oktaAccountProfileSync.clientId, oktaCustomerIdWriteback.clientId, or ACME_OKTA_MANAGEMENT_CLIENT_ID before deploying."
  }

  if (-not $oktaManagementPrivateKeySecretValue) {
    if (Test-KeyVaultSecretExists -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $foundationResourceGroupName -VaultName $keyVaultName -SecretName $oktaManagementPrivateKeySecretName) {
      Write-Warning "Environment '$EnvironmentName' enables Okta profile sync but ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM is not set. Deployment will reuse the existing Key Vault secret '$oktaManagementPrivateKeySecretName'. Set the env var only for first-time setup or key rotation."
    } else {
      throw "Environment '$EnvironmentName' enables Okta profile sync, but ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM is not set and Key Vault secret '$oktaManagementPrivateKeySecretName' does not exist. Set the env var for first-time setup or key rotation."
    }
  }

  if ($oktaManagementScopes -notmatch '(^|[\s,;])okta\.users\.read($|[\s,;])' -or $oktaManagementScopes -notmatch '(^|[\s,;])okta\.users\.manage($|[\s,;])') {
    throw "Environment '$EnvironmentName' enables Okta profile sync. oktaAccountProfileSync.scopes or oktaCustomerIdWriteback.scopes must include okta.users.read and okta.users.manage."
  }

  if ($oktaManagementPrivateKeySecretValue) {
    Set-KeyVaultSecretFromValue -SubscriptionId $resolvedSubscriptionId -ResourceGroupName $foundationResourceGroupName -VaultName $keyVaultName -SecretName $oktaManagementPrivateKeySecretName -SecretValue $oktaManagementPrivateKeySecretValue
  }
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
$runtimeSecretNames = @('sec-acme-los-web-session-secret')
if ($resolvedBffDeploymentEnabled) { $runtimeSecretNames += 'sec-acme-los-bff-trusted-proxy-secret' }
foreach ($secretName in $runtimeSecretNames) {
  if (-not (Test-KeyVaultSecretExists $resolvedSubscriptionId $foundationResourceGroupName $keyVaultName $secretName)) {
    if ($RecoverRetiredResourceGroup) { throw 'A retained runtime secret is missing. Recovery never creates or rotates secrets.' }
    Set-KeyVaultSecretFromValue $resolvedSubscriptionId $foundationResourceGroupName $keyVaultName $secretName (New-SecureRandomBase64Url)
  }
}
$bffServiceAuthConfiguration =
  Get-OptionalPropertyValue -InputObject $bffRuntimeConfiguration -Name 'serviceAuth'
$bffServiceAuthMode = Get-StringOrDefault `
  -Value (Get-OptionalPropertyValue -InputObject $bffServiceAuthConfiguration -Name 'mode') `
  -DefaultValue 'disabled'
$bffServiceAuthMode = $bffServiceAuthMode.Trim().ToLowerInvariant()

if ($bffServiceAuthMode -in @('off', 'none')) {
  $bffServiceAuthMode = 'disabled'
}

if ($bffServiceAuthMode -notin @('disabled', 'entra')) {
  throw "Unsupported bffRuntime.serviceAuth.mode '$bffServiceAuthMode'. Use 'disabled' or 'entra'."
}

$bffServiceAuthEnabled =
  $resolvedBffDeploymentEnabled -and $bffServiceAuthMode -eq 'entra'
$bffServiceAuthAudience = ''
$bffServiceAuthTokenScope = ''
$bffServiceAuthAllowedClientIds = ''
$bffServiceAuthAllowedObjectIds = ''

if ($bffServiceAuthEnabled) {
  $bffServiceAuthAudience = Get-OptionalString (
    Get-OptionalPropertyValue -InputObject $bffServiceAuthConfiguration -Name 'audience'
  )
  $bffServiceAuthTokenScope = Get-OptionalString (
    Get-OptionalPropertyValue -InputObject $bffServiceAuthConfiguration -Name 'tokenScope'
  )
  $bffServiceAuthAllowedClientIds = Get-StringOrDefault `
    -Value (Get-OptionalPropertyValue -InputObject $bffServiceAuthConfiguration -Name 'allowedClientIds') `
    -DefaultValue $userAssignedIdentityClientId
  $bffServiceAuthAllowedObjectIds = Get-StringOrDefault `
    -Value (Get-OptionalPropertyValue -InputObject $bffServiceAuthConfiguration -Name 'allowedObjectIds') `
    -DefaultValue $userAssignedIdentityPrincipalId

  $entraServiceAuthDeploymentArguments = @(
    'deployment', 'group', 'create',
    '--subscription', $resolvedSubscriptionId,
    '--resource-group', $resourceGroupName,
    '--name', "entra-service-auth-$EnvironmentName",
    '--template-file', $EntraServiceAuthTemplateFile,
    '--parameters', "environmentName=$EnvironmentName",
    '--parameters', "organizationShortName=$($configuration.organizationShortName)",
    '--parameters', "workloadShortName=$($configuration.workloadShortName)",
    '--parameters', "webManagedIdentityClientId=$userAssignedIdentityClientId",
    '--parameters', "webManagedIdentityPrincipalId=$userAssignedIdentityPrincipalId",
    '--output', 'json'
  )

  if ($bffServiceAuthAudience) {
    $entraServiceAuthDeploymentArguments += @(
      '--parameters',
      "bffApiIdentifierUri=$bffServiceAuthAudience"
    )
  }

  $entraServiceAuthDeployment = if ($preserveFoundation) {
    Invoke-AzJson -Arguments @('deployment', 'group', 'show', '--subscription', $resolvedSubscriptionId, '--resource-group', $foundationResourceGroupName, '--name', "entra-service-auth-$EnvironmentName")
  } else {
    Invoke-AzJson -Arguments $entraServiceAuthDeploymentArguments
  }
  $entraServiceAuthOutputs = Get-DeploymentOutputs -DeploymentResult $entraServiceAuthDeployment
  $bffServiceAuthApplicationClientId =
    Get-StringOutputValue -Outputs $entraServiceAuthOutputs -Name 'bffApiApplicationClientId'

  if (-not $bffServiceAuthAudience) {
    $bffServiceAuthAudience =
      Get-StringOutputValue -Outputs $entraServiceAuthOutputs -Name 'bffServiceAuthAudience'
  }

  if (-not $bffServiceAuthTokenScope) {
    $bffServiceAuthTokenScope =
      Get-StringOutputValue -Outputs $entraServiceAuthOutputs -Name 'bffServiceAuthTokenScope'
  }

  if (-not $bffServiceAuthAudience -or -not $bffServiceAuthTokenScope) {
    throw "bffRuntime.serviceAuth requires the Entra BFF audience and token scope. Configure them explicitly or allow '$EntraServiceAuthTemplateFile' to create them."
  }

  $acceptedAudiences =
    @(
      $bffServiceAuthAudience,
      $bffServiceAuthApplicationClientId
    ) |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Select-Object -Unique
  $bffServiceAuthAudience = [string]::Join(',', $acceptedAudiences)
}
$oktaEnvironmentNameConfiguration = Get-OptionalPropertyValue -InputObject $environmentConfiguration -Name 'oktaEnvironmentName'
$oktaEnvironmentName = if ($oktaEnvironmentNameConfiguration) {
  [string]$oktaEnvironmentNameConfiguration
} else {
  $EnvironmentName
}
$analyticsEnvironmentNameConfiguration = Get-OptionalPropertyValue -InputObject $environmentConfiguration -Name 'analyticsEnvironmentName'
$analyticsEnvironmentName = if ($analyticsEnvironmentNameConfiguration) {
  [string]$analyticsEnvironmentNameConfiguration
} else {
  $EnvironmentName
}
$customDomainEnabled = ConvertTo-Boolean (
  Get-OptionalPropertyValue -InputObject $publicDomainConfiguration -Name 'enabled'
)
$customDomainEnabledEnvValue = if ($customDomainEnabled) { 'true' } else { 'false' }
$customDomainHostname = Get-StringOrDefault -Value (
  Get-OptionalPropertyValue -InputObject $publicDomainConfiguration -Name 'hostname'
)
if ($customDomainEnabled -and -not $customDomainHostname) {
  throw "Environment '$EnvironmentName' enables publicDomain but does not declare a hostname."
}

$oktaEnvironment = Get-OktaEnvironmentConfiguration -RepositoryRoot $repositoryRoot -OktaEnvironmentName $oktaEnvironmentName
$analyticsEnvironment = Get-AnalyticsEnvironmentConfiguration -RepositoryRoot $repositoryRoot -AnalyticsEnvironmentName $analyticsEnvironmentName
$configuredDeployedWebBaseUrl = Resolve-DeployedWebBaseUrl -WebConfiguration $oktaEnvironment.web
$resolvedPublicWebBaseUrl = $resolvedContainerAppBaseUrl

if (
  $configuredDeployedWebBaseUrl -and
  ($configuredDeployedWebBaseUrl.TrimEnd('/') -ne $resolvedContainerAppBaseUrl.TrimEnd('/'))
) {
  $configuredDeployedWebHost = ([Uri]$configuredDeployedWebBaseUrl).Host.ToLowerInvariant()
  if (-not $customDomainEnabled -or $configuredDeployedWebHost -ne $customDomainHostname.ToLowerInvariant()) {
    throw "Okta environment '$oktaEnvironmentName' declares deployed base URL '$configuredDeployedWebBaseUrl', but the matching publicDomain is not enabled for Azure deployment."
  }

  $resolvedPublicWebBaseUrl = $configuredDeployedWebBaseUrl.TrimEnd('/')
  Write-Host "Using Bicep-managed custom web hostname '$resolvedPublicWebBaseUrl' for Okta callbacks and browser configuration."
}

$oktaIssuer = Get-OptionalString $oktaEnvironment.okta.issuer
$oktaOrgUrl = Get-OptionalString $oktaEnvironment.okta.orgUrl
$oktaClientId = Get-OptionalString $oktaEnvironment.okta.webClientId
$oktaFundingAcrValues = Get-OptionalString $oktaEnvironment.okta.fundingStepUpAcrValues
$oktaFundingStepUpMethod = Get-StringOrDefault -Value $oktaEnvironment.okta.hostedExperience.fundingStepUpMethod -DefaultValue 'email_or_sms'
$oktaFundingStepUpRequiresPassword = [bool]($oktaEnvironment.okta.hostedExperience.fundingStepUpRequiresPassword)
$themeCookieDomain = Get-StringOrDefault -Value $oktaEnvironment.okta.hostedExperience.themeCookieDomain
$oktaRedirectPath = Get-OptionalString $oktaEnvironment.web.redirectPath
$oktaPostLogoutRedirectPath = Get-OptionalString $oktaEnvironment.web.postLogoutRedirectPath

if (-not $oktaIssuer -or -not $oktaOrgUrl -or -not $oktaClientId -or -not $oktaRedirectPath -or -not $oktaPostLogoutRedirectPath) {
  throw "Okta environment '$oktaEnvironmentName' is missing required web auth settings."
}


$resolvedOktaRedirectUri = Join-AbsoluteUrl -BaseUrl $resolvedPublicWebBaseUrl -Path $oktaRedirectPath
$resolvedOktaPostLogoutRedirectUri = Join-AbsoluteUrl -BaseUrl $resolvedPublicWebBaseUrl -Path $oktaPostLogoutRedirectPath
$analyticsEnabled = ConvertTo-Boolean $analyticsEnvironment.enabled
$analyticsEnabledEnvValue = if ($analyticsEnabled) { 'true' } else { 'false' }
$analyticsRuntimeEnvironmentName = Get-StringOrDefault -Value $analyticsEnvironment.environment -DefaultValue $EnvironmentName
$gtmContainerId = Get-StringOrDefault -Value $analyticsEnvironment.google.gtmContainerId
$ga4MeasurementId = Get-StringOrDefault -Value $analyticsEnvironment.google.ga4MeasurementId
$analyticsConsentDefaultAnalyticsStorage = Get-StringOrDefault -Value $analyticsEnvironment.consent.defaultAnalyticsStorage -DefaultValue 'denied'
$analyticsConsentDefaultAdStorage = Get-StringOrDefault -Value $analyticsEnvironment.consent.defaultAdStorage -DefaultValue 'denied'
$analyticsConsentDefaultAdUserData = Get-StringOrDefault -Value $analyticsEnvironment.consent.defaultAdUserData -DefaultValue 'denied'
$analyticsConsentDefaultAdPersonalization = Get-StringOrDefault -Value $analyticsEnvironment.consent.defaultAdPersonalization -DefaultValue 'denied'
$ga4MeasurementProtocolSecretName = Get-StringOrDefault -Value $analyticsEnvironment.google.measurementProtocolSecretName -DefaultValue 'sec-acme-los-ga4-measurement-secret'

if (-not (Test-ContainerRegistryTagExists -SubscriptionId $resolvedSubscriptionId -RegistryName $resolvedContainerRegistryName -RepositoryName $WebImageRepository -Tag $resolvedImageTag)) {
  if ($ReuseExistingImages) { throw 'Recovery image is missing; refusing to build replacement code.' }
  $containerBuildContextPath = New-ContainerBuildContext -RepositoryRoot $repositoryRoot

  try {
    az acr build `
      --subscription $resolvedSubscriptionId `
      --registry $resolvedContainerRegistryName `
      --image "${WebImageRepository}:$resolvedImageTag" `
      --file apps/web-app/Dockerfile `
      --build-arg "NEXT_PUBLIC_APP_ENVIRONMENT=$($environmentConfiguration.appEnvironmentName)" `
      --build-arg "NEXT_PUBLIC_APP_BUILD=$resolvedBuildId" `
      --build-arg "NEXT_PUBLIC_OKTA_ISSUER=$oktaIssuer" `
      --build-arg "NEXT_PUBLIC_ACME_THEME_COOKIE_DOMAIN=$themeCookieDomain" `
      --build-arg "NEXT_PUBLIC_ACME_ANALYTICS_ENABLED=$analyticsEnabledEnvValue" `
      --build-arg "NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT=$analyticsRuntimeEnvironmentName" `
      --build-arg "NEXT_PUBLIC_ACME_GTM_CONTAINER_ID=$gtmContainerId" `
      --build-arg "NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID=$ga4MeasurementId" `
      --build-arg "NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE=$analyticsConsentDefaultAnalyticsStorage" `
      --build-arg "NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE=$analyticsConsentDefaultAdStorage" `
      --build-arg "NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA=$analyticsConsentDefaultAdUserData" `
      --build-arg "NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION=$analyticsConsentDefaultAdPersonalization" `
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
  if ($ReuseExistingImages) { throw 'Recovery BFF image is missing; refusing to build replacement code.' }
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
  '--parameters', "environmentName=$EnvironmentName", "workloadVirtualNetworkId=$workloadVirtualNetworkId", "regionShortName=$($runtimeRegion.ShortName)",
  '--action-on-unmanage', 'deleteResources',
  '--deny-settings-mode', 'none',
  '--description', "ACME LOS platform DNS link stack for $EnvironmentName workload networking",
  '--yes'
)

if (-not $RecoverRetiredResourceGroup -or $runtimeRegion.Relocated) { Invoke-AzNoOutput -Arguments $platformWorkloadLinksDeploymentArguments }
$platformWorkloadLinksDeployment = Invoke-AzJson -Arguments @(
  'stack', 'group', 'show',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--resource-group', $platformNetworkResourceGroupName,
  '--name', $platformWorkloadLinksStackName
)
$platformOutputs = Get-DeploymentOutputs -DeploymentResult $platformWorkloadLinksDeployment

if ($RecoverRetiredResourceGroup) {
  $recoveryConnectivity = @(Get-DevPrivateConnectivityPlan $configuration $resolvedSubscriptionId $resolvedPlatformSubscriptionId $resourceGroupName)
  foreach ($endpoint in $recoveryConnectivity) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      Update-PrivateConnectivityState $endpoint
      if ($endpoint.ready) { break }
      Start-Sleep -Seconds 5
    }
    if (-not $endpoint.ready) { throw 'Recovery private connectivity is not ready; no apps have been started.' }
  }
}

$runtimeDeploymentArguments = @(
  'deployment', 'group', 'create',
  '--subscription', $resolvedSubscriptionId,
  '--resource-group', $resourceGroupName,
  '--name', "runtime-$EnvironmentName",
  '--template-file', $WebRuntimeTemplateFile,
  '--parameters', "environmentName=$EnvironmentName",
  '--parameters', "organizationShortName=$($configuration.organizationShortName)",
  '--parameters', "workloadShortName=$($configuration.workloadShortName)",
  '--parameters', "regionShortName=$($runtimeRegion.ShortName)",
  '--parameters', "location=$Location",
  '--parameters', "ownerTag=vc4u2c",
  '--parameters', "costCenterTag=playg",
  '--parameters', "containerRegistryLoginServer=$resolvedContainerRegistryLoginServer",
  '--parameters', "containerImage=$imageReference",
  '--parameters', "managedEnvironmentId=$managedEnvironmentId",
  '--parameters', "userAssignedIdentityResourceId=$userAssignedIdentityResourceId",
  '--parameters', "userAssignedIdentityClientId=$userAssignedIdentityClientId",
  '--parameters', "appBuildId=$resolvedBuildId",
  '--parameters', "oktaEnvironmentName=$oktaEnvironmentName",
  '--parameters', "oktaIssuer=$oktaIssuer",
  '--parameters', "oktaOrgUrl=$oktaOrgUrl",
  '--parameters', "oktaClientId=$oktaClientId",
  '--parameters', "oktaRedirectUri=$resolvedOktaRedirectUri",
  '--parameters', "oktaPostLogoutRedirectUri=$resolvedOktaPostLogoutRedirectUri",
  '--parameters', "oktaFundingAcrValues=$oktaFundingAcrValues",
  '--parameters', "oktaFundingStepUpMethod=$oktaFundingStepUpMethod",
  '--parameters', "oktaFundingStepUpRequiresPassword=$($oktaFundingStepUpRequiresPassword.ToString().ToLowerInvariant())",
  '--parameters', "themeCookieDomain=$themeCookieDomain",
  '--parameters', "customDomainEnabled=$customDomainEnabledEnvValue",
  '--parameters', "customDomainHostname=$customDomainHostname",
  '--parameters', "analyticsEnabled=$analyticsEnabledEnvValue",
  '--parameters', "analyticsEnvironmentName=$analyticsRuntimeEnvironmentName",
  '--parameters', "gtmContainerId=$gtmContainerId",
  '--parameters', "ga4MeasurementId=$ga4MeasurementId",
  '--parameters', "analyticsConsentDefaultAnalyticsStorage=$analyticsConsentDefaultAnalyticsStorage",
  '--parameters', "analyticsConsentDefaultAdStorage=$analyticsConsentDefaultAdStorage",
  '--parameters', "analyticsConsentDefaultAdUserData=$analyticsConsentDefaultAdUserData",
  '--parameters', "analyticsConsentDefaultAdPersonalization=$analyticsConsentDefaultAdPersonalization",
  '--parameters', "ga4MeasurementProtocolSecretName=$ga4MeasurementProtocolSecretName",
  '--parameters', "smsMfaEnabled=$smsMfaEnabledEnvValue",
  '--parameters', "smsMfaProvider=$smsMfaProvider",
  '--parameters', "mockSmsOtpEnabled=$smsMfaMockOtpEnabledEnvValue",
  '--parameters', "communicationServicesEndpoint=$communicationServicesEndpoint",
  '--parameters', "smsSenderPhoneNumber=$smsSenderPhoneNumber",
  '--parameters', "oktaCustomerIdWritebackMode=$oktaCustomerIdWritebackMode",
  '--parameters', "oktaManagementClientId=$oktaManagementClientId",
  '--parameters', "oktaManagementPrivateKeyId=$oktaManagementPrivateKeyId",
  '--parameters', "oktaManagementScopes=$oktaManagementScopes",
  '--parameters', "oktaEmailLoginSyncEnabled=$($oktaEmailLoginSyncEnabled.ToString().ToLowerInvariant())",
  '--parameters', "applicationInsightsConnectionString=$platformApplicationInsightsConnectionString",
  '--parameters', "logAnalyticsWorkspaceId=$platformLogAnalyticsWorkspaceId",
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
    '--parameters', "bffMinReplicas=$bffRuntimeMinReplicas",
    '--parameters', "bffMaxReplicas=$bffRuntimeMaxReplicas"
  )
}

if ($bffServiceAuthEnabled) {
  $runtimeDeploymentArguments += @(
    '--parameters', 'bffServiceAuthMode=entra',
    '--parameters', "bffServiceAuthTenantId=$resolvedTenantId",
    '--parameters', "bffServiceAuthAudience=$bffServiceAuthAudience",
    '--parameters', "bffServiceAuthTokenScope=$bffServiceAuthTokenScope",
    '--parameters', "bffServiceAuthAllowedClientIds=$bffServiceAuthAllowedClientIds",
    '--parameters', "bffServiceAuthAllowedObjectIds=$bffServiceAuthAllowedObjectIds"
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

if ($customDomainEnabled) {
  $existingApps = @(ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('containerapp', 'list', '--subscription', $resolvedSubscriptionId, '--resource-group', $resourceGroupName)))
  $existingApp = $existingApps | Where-Object { $_.name -eq $resolvedContainerAppName } | Select-Object -First 1
  $certificateName = "mcert-$($configuration.organizationShortName)-$($configuration.workloadShortName)-$EnvironmentName-$($customDomainHostname.Replace('.', '-'))".ToLowerInvariant()
  $certificateId = "$managedEnvironmentId/managedCertificates/$certificateName"
  $initialPhase = Get-WebCustomDomainInitialPhase $existingApp $customDomainHostname $certificateId
  $runtimeDeployment = Invoke-WebCustomDomainDeployment -InitialPhase $initialPhase -DeployRuntime {
    param($phase)
    Invoke-AzJson -Arguments ($runtimeDeploymentArguments + @('--parameters', "customDomainPhase=$phase")) -Sensitive
  } -VerifyDns {
    $dnsAction = if ($SyncPublicDns) { 'sync-dns' } else { 'verify-dns' }
    & (Join-Path $PSScriptRoot 'configure-web-custom-domain.ps1') -EnvironmentName $EnvironmentName `
      -SubscriptionId $resolvedSubscriptionId -PlatformSubscriptionId $resolvedPlatformSubscriptionId -ConfigurationPath $ConfigurationPath -Action $dnsAction `
      -ConfirmDnsZone $ConfirmDnsZone -DnsAttempts 30
  } -IssueCertificate {
    Invoke-AzJson -Arguments @(
      'deployment', 'group', 'create', '--subscription', $resolvedSubscriptionId, '--resource-group', $resourceGroupName,
      '--name', "certificate-$EnvironmentName", '--template-file', (Join-Path $PSScriptRoot '../../../infra/azure/bicep/main.web.certificate.rg.bicep'),
      '--parameters', "environmentName=$EnvironmentName", "location=$Location", "managedEnvironmentName=$(Split-Path $managedEnvironmentId -Leaf)",
      "hostname=$customDomainHostname", "organizationShortName=$($configuration.organizationShortName)", "workloadShortName=$($configuration.workloadShortName)"
    ) | Out-Null
    Wait-WebManagedCertificate -CertificateId $certificateId -Hostname $customDomainHostname
  } -VerifyHttps {
    Wait-WebCustomDomainHealth -Hostname $customDomainHostname -EnvironmentName $EnvironmentName -BuildId $resolvedBuildId
  }
} else {
  $runtimeDeployment = Invoke-AzJson -Arguments $runtimeDeploymentArguments -Sensitive
}
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
  '--parameters', "alertsEnabled=$((-not [bool]$RecoverRetiredResourceGroup).ToString().ToLowerInvariant())",
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

if (-not $RecoverRetiredResourceGroup -or $runtimeRegion.Relocated) { Invoke-AzNoOutput -Arguments $monitoringDeploymentArguments }
$monitoringDeployment = Invoke-AzJson -Arguments @(
  'stack', 'group', 'show',
  '--subscription', $resolvedPlatformSubscriptionId,
  '--resource-group', $platformMonitorResourceGroupName,
  '--name', $platformMonitoringStackName
)
$monitoringOutputs = Get-DeploymentOutputs -DeploymentResult $monitoringDeployment
$workbookResourceName = Get-StringOutputValue -Outputs $monitoringOutputs -Name 'workbookResourceName'
$workbookDisplayName = Get-StringOutputValue -Outputs $monitoringOutputs -Name 'workbookDisplayName'

if ($workbookResourceName -and $workbookDisplayName -and (-not $RecoverRetiredResourceGroup -or $runtimeRegion.Relocated)) {
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
    -Location $configuration.primaryLocation | Out-Null
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
  bffServiceAuthMode = if ($bffServiceAuthEnabled) { 'entra' } else { 'disabled' }
  bffServiceAuthAudience = $bffServiceAuthAudience
  bffServiceAuthTokenScope = $bffServiceAuthTokenScope
  bffServiceAuthAllowedClientIds = $bffServiceAuthAllowedClientIds
  bffServiceAuthAllowedObjectIds = $bffServiceAuthAllowedObjectIds
  bffImageRepository = $BffImageRepository
  bffVersion = $resolvedBffVersion
  imageTag = $resolvedImageTag
  appBuildId = $resolvedBuildId
  imageReference = $imageReference
  bffImageReference = $bffImageReference
  containerAppEnvironmentName = Get-StringOutputValue -Outputs $outputs -Name 'containerAppEnvironmentName'
  containerAppName = Get-StringOutputValue -Outputs $runtimeOutputs -Name 'containerAppName'
  containerAppBaseUrl = $resolvedContainerAppBaseUrl
  publicWebBaseUrl = $resolvedPublicWebBaseUrl
  containerAppLatestRevisionFqdn = Get-StringOutputValue -Outputs $runtimeOutputs -Name 'containerAppLatestRevisionFqdn'
  bffContainerAppName = $deployedBffContainerAppName
  bffContainerAppBaseUrl = $deployedBffContainerAppBaseUrl
  bffContainerAppLatestRevisionFqdn = $deployedBffContainerAppLatestRevisionFqdn
  userAssignedIdentityName = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityName'
  userAssignedIdentityClientId = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityClientId'
  userAssignedIdentityPrincipalId = Get-StringOutputValue -Outputs $outputs -Name 'userAssignedIdentityPrincipalId'
  workloadVirtualNetworkName = Get-StringOutputValue -Outputs $outputs -Name 'workloadVirtualNetworkName'
  workloadVirtualNetworkId = $workloadVirtualNetworkId
  appSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'appSubnetName'
  dataSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'dataSubnetName'
  acaInfrastructureSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'acaInfrastructureSubnetName'
  privateEndpointSubnetName = Get-StringOutputValue -Outputs $outputs -Name 'privateEndpointSubnetName'
  keyVaultName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultName'
  keyVaultPrivateEndpointName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultPrivateEndpointName'
  keyVaultPrivateEndpointNetworkInterfaceName = Get-StringOutputValue -Outputs $outputs -Name 'keyVaultPrivateEndpointNetworkInterfaceName'
  communicationServicesName = $communicationServicesName
  communicationServicesEndpoint = $communicationServicesEndpoint
  smsMfaEnabled = $smsMfaEnabled
  smsSenderPhoneNumber = $smsSenderPhoneNumber
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
