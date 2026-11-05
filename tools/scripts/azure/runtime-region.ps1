Set-StrictMode -Version Latest

function Get-WebRuntimeRegion {
  param($Configuration, [string]$EnvironmentName)

  $environment = $Configuration.environments.PSObject.Properties[$EnvironmentName]
  if (-not $environment) { throw 'Unknown workload environment.' }
  $property = $environment.Value.PSObject.Properties['runtimeRegion']
  $location = if ($Configuration.PSObject.Properties['primaryLocation']) { [string]$Configuration.primaryLocation } else { 'centralus' }
  $region = [string]$Configuration.primaryRegionShortName
  if ($property) {
    if ($EnvironmentName -cne 'dev' -or $Configuration.projectName -cne 'acme-los' -or
      $environment.Value.subscriptionRole -cne 'nonprod' -or $location -cne 'centralus' -or $region -cne 'cus' -or
      $property.Value.location -cne 'eastus2' -or $property.Value.shortName -cne 'eus2') {
      throw 'Only the reviewed ACME LOS dev Central US to East US 2 runtime relocation is supported.'
    }
    $location = 'eastus2'
    $region = 'eus2'
  }
  [pscustomobject]@{ Location = $location; ShortName = $region; Relocated = [bool]$property }
}

function Get-WebRuntimeResourceGroupName {
  param($Configuration, [string]$EnvironmentName)
  $region = Get-WebRuntimeRegion $Configuration $EnvironmentName
  return "rg-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-web-$EnvironmentName-$($region.ShortName)-01".ToLowerInvariant()
}

function Assert-RegionalRedisPreflight {
  param($Configuration, [string]$EnvironmentName, [string]$SubscriptionId, [string]$ResourceGroupName, $WebTemplate, $Parameters)
  $region = Get-WebRuntimeRegion $Configuration $EnvironmentName
  if (-not $region.Relocated -and $region.Location -cne 'eastus') { return }
  if ($ResourceGroupName -cne (Get-WebRuntimeResourceGroupName $Configuration $EnvironmentName)) { throw 'Redis preflight requires the configured regional runtime group.' }
  $arguments = @('deployment', 'group', 'validate', '--subscription', $SubscriptionId, '--resource-group', $ResourceGroupName,
    '--name', "validate-regional-redis-$EnvironmentName", '--validation-level', 'Provider',
    '--template-file', (Join-Path $PSScriptRoot '../../../infra/azure/bicep/modules/state/managed-redis.bicep'),
    '--parameters', "location=$($region.Location)", "name=redis-$($Configuration.organizationShortName)-$($Configuration.workloadShortName)-$EnvironmentName-$($region.ShortName)-01")
  # Resolve the same Bicep overrides/defaults as the real deployment, without allocating a cache.
  foreach ($pair in @(@('skuName', 'redisSkuName'), @('clusteringPolicy', 'redisClusteringPolicy'))) {
    $override = $Parameters.PSObject.Properties[$pair[1]]
    $value = if ($override) { $override.Value.value } else { $WebTemplate.parameters.($pair[1]).defaultValue }
    if ($value -isnot [string] -or [string]::IsNullOrWhiteSpace($value)) { throw 'Redis preflight requires explicit non-secret SKU and clustering values.' }
    $arguments += "$($pair[0])=$value"
  }
  try { Invoke-AzNoOutput -Arguments $arguments } catch {
    throw 'Regional Redis provider validation failed before runtime provisioning. Check the subscription SKU access and provider error before retrying; no larger SKU is selected automatically.'
  }
}
