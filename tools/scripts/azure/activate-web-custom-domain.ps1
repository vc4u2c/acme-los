[CmdletBinding()]
param(
  [ValidateSet('dev')][string]$EnvironmentName = 'dev',
  [ValidateSet('show-plan', 'apply', 'sync-auth-origin')][string]$Action = 'show-plan',
  [Parameter(Mandatory = $true)][guid]$SubscriptionId,
  [Parameter(Mandatory = $true)][guid]$PlatformSubscriptionId,
  [string]$ConfirmHostname,
  [string]$ConfigurationPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'azure-dns.ps1')
. (Join-Path $PSScriptRoot 'public-domain.ps1')
. (Join-Path $PSScriptRoot 'private-connectivity.ps1')

function Invoke-AzJson {
  param([string[]]$Arguments)
  return Invoke-AzureDnsJson -Arguments $Arguments
}

function Get-DomainActivationProtectedState {
  param($App, [switch]$IgnoreAuthOrigin)
  $configuration = $App.properties.configuration | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  if (-not $IgnoreAuthOrigin) { $configuration.ingress.PSObject.Properties.Remove('customDomains') }
  $template = $App.properties.template | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  foreach ($container in $template.containers) {
    foreach ($entry in $container.env) {
      $reference = $entry.PSObject.Properties['secretRef']
      $literal = $entry.PSObject.Properties['value']
      # Azure CLI adds an empty value alongside an unchanged secretRef.
      if ($reference -and -not [string]::IsNullOrEmpty($reference.Value) -and $literal -and [string]::IsNullOrEmpty($literal.Value)) {
        $entry.PSObject.Properties.Remove('value')
      }
    }
  }
  if ($IgnoreAuthOrigin) {
    $template.containers[0].env = @($template.containers[0].env | Where-Object {
      $_.name -notin @('ACME_OKTA_REDIRECT_URI', 'ACME_OKTA_POST_LOGOUT_REDIRECT_URI')
    })
  }
  return [ordered]@{
    id = $App.id
    identity = $App.identity
    environment = $App.properties.environmentId
    template = $template
    configuration = $configuration
  } | ConvertTo-Json -Depth 100 -Compress
}

function Get-DomainActivationBuild {
  param($App)
  $build = @($App.properties.template.containers[0].env | Where-Object { $_.name -eq 'APP_BUILD_ID' })
  if ($build.Count -ne 1 -or [string]::IsNullOrWhiteSpace($build[0].value)) {
    throw 'The existing application must declare its build identity.'
  }
  return [string]$build[0].value
}

if (-not $ConfigurationPath) { $ConfigurationPath = Join-Path $PSScriptRoot '../../../infra/azure/config/platform.json' }
$configuration = Get-Content -Raw -LiteralPath $ConfigurationPath | ConvertFrom-Json
$dns = Get-AzureWebDnsConfiguration $configuration $EnvironmentName $PlatformSubscriptionId
$domain = Assert-WebPublicDomainConfiguration $configuration $EnvironmentName -SyncPublicDns -ConfirmDnsZone $dns.Zone
if ($Action -ne 'show-plan' -and $ConfirmHostname -cne $domain.hostname) { throw 'ConfirmHostname must exactly match the configured hostname.' }

$account = Invoke-AzJson @('account', 'show', '--subscription', "$SubscriptionId")
if ($account.name -cne $configuration.subscriptions.nonprodOnline) { throw 'Unexpected workload subscription.' }
$resourceGroup = "rg-$($configuration.organizationShortName)-$($configuration.workloadShortName)-web-$EnvironmentName-$($configuration.primaryRegionShortName)-01"
$group = Invoke-AzJson @('group', 'show', '--subscription', "$SubscriptionId", '--name', $resourceGroup)
if ($group.tags.'acme:application' -cne $configuration.projectName) { throw 'Unexpected workload ownership.' }
$hibernated = $group.tags.PSObject.Properties['acme:hibernated']
if ($hibernated -and $hibernated.Value -eq 'true') { throw 'Resume the workload before hostname activation.' }
$deployments = @(Invoke-AzJson @('deployment', 'group', 'list', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup) | ForEach-Object { $_ })
if (@($deployments | Where-Object { $_.properties.provisioningState -in @('Accepted', 'Running', 'Creating', 'Updating') }).Count) {
  throw 'A workload deployment is in progress. Do not run activation concurrently.'
}

$webName = "ca-$($configuration.organizationShortName)-$($configuration.workloadShortName)-web-$EnvironmentName-$($configuration.primaryRegionShortName)-01"
$bffName = $webName.Replace('-web-', '-bff-')
$webRead = @('containerapp', 'show', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup, '--name', $webName)
$bffRead = @('containerapp', 'show', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup, '--name', $bffName)
$web = Invoke-AzJson $webRead
$bff = Invoke-AzJson $bffRead
foreach ($app in @($web, $bff)) {
  if ($app.properties.runningStatus -ne 'Running' -or $app.properties.provisioningState -ne 'Succeeded') {
    throw 'Both existing apps must be running and provisioned before activation.'
  }
}
if (-not $web.properties.configuration.ingress.external -or $bff.properties.configuration.ingress.external) {
  throw 'Expected public web ingress and private BFF ingress.'
}
$build = Get-DomainActivationBuild $web
if ((Get-DomainActivationBuild $bff) -cne $build) { throw 'Web and BFF must already run the same build.' }
$webState = Get-DomainActivationProtectedState $web
$bffState = Get-DomainActivationProtectedState $bff
$environmentId = $web.properties.environmentId
$managedEnvironmentName = ($environmentId -split '/')[-1]
$certificateName = "mcert-$($configuration.organizationShortName)-$($configuration.workloadShortName)-$EnvironmentName-$($domain.hostname.Replace('.', '-'))"
$certificateId = "$environmentId/managedCertificates/$certificateName"
$phase = Get-WebCustomDomainInitialPhase $web $domain.hostname $certificateId
$zone = Get-AzureWebDnsZone $dns
Assert-AzureWebDnsDelegation $dns $zone

if ($Action -eq 'show-plan') {
  [ordered]@{ action = $Action; hostname = $domain.hostname; build = $build; initialPhase = $phase;
    webImage = $web.properties.template.containers[0].image; bffImage = $bff.properties.template.containers[0].image;
    certificateId = $certificateId; modifies = @('two app DNS records', 'web hostname binding', 'managed certificate');
    preserves = @('images', 'runtime configuration', 'Key Vault secrets', 'identities', 'deployment stacks', 'alerts') } | ConvertTo-Json -Depth 6
  return
}

Wait-WebCustomDomainHealth $web.properties.configuration.ingress.fqdn $EnvironmentName $build -Attempts 3
if ($Action -eq 'sync-auth-origin') {
  if ($phase -ne 'bind') { throw 'Activate HTTPS before migrating auth origins.' }
  Wait-WebCustomDomainHealth $domain.hostname $EnvironmentName $build -Attempts 3
  $oktaPath = Join-Path $PSScriptRoot "../../../infra/okta/environments/$EnvironmentName.json"
  $okta = Get-Content -Raw -LiteralPath $oktaPath | ConvertFrom-Json
  if ($okta.web.deployedBaseUrl -cne "https://$($domain.hostname)") { throw 'The Okta manifest must use the activated HTTPS origin.' }
  $expected = [ordered]@{
    ACME_OKTA_REDIRECT_URI = "$($okta.web.deployedBaseUrl)$($okta.web.redirectPath)"
    ACME_OKTA_POST_LOGOUT_REDIRECT_URI = "$($okta.web.deployedBaseUrl)$($okta.web.postLogoutRedirectPath)"
  }
  # Update only the two public callback values. Secret references and images remain unchanged.
  foreach ($app in @($bff, $web)) {
    $before = Get-DomainActivationProtectedState $app -IgnoreAuthOrigin
    $changes = @()
    foreach ($key in $expected.Keys) {
      $entry = @($app.properties.template.containers[0].env | Where-Object { $_.name -ceq $key })
      if ($entry.Count -ne 1) { throw 'An expected runtime callback setting is missing or ambiguous.' }
      if ($entry[0].value -cne $expected[$key]) { $changes += "$key=$($expected[$key])" }
    }
    if ($changes.Count) {
      Invoke-AzJson (@('containerapp', 'update', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup,
        '--name', $app.name, '--container-name', $app.properties.template.containers[0].name, '--set-env-vars') + $changes) | Out-Null
    }
    $updated = Invoke-AzJson @('containerapp', 'show', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup, '--name', $app.name)
    if ((Get-DomainActivationProtectedState $updated -IgnoreAuthOrigin) -cne $before) { throw 'Unexpected runtime change during origin migration. Inspect Azure before retrying.' }
    foreach ($key in $expected.Keys) {
      $entry = @($updated.properties.template.containers[0].env | Where-Object { $_.name -ceq $key })
      if ($entry.Count -ne 1 -or $entry[0].value -cne $expected[$key]) { throw 'Runtime callback configuration did not persist.' }
    }
    Wait-ForContainerAppReady -SubscriptionId $SubscriptionId -ResourceGroupName $resourceGroup -Name $app.name
  }
  Wait-WebCustomDomainHealth $domain.hostname $EnvironmentName $build
  [ordered]@{ action = $Action; hostname = $domain.hostname; build = $build; status = 'auth-origin-configured' } | ConvertTo-Json
  return
}

& (Join-Path $PSScriptRoot 'configure-web-custom-domain.ps1') -EnvironmentName $EnvironmentName -Action sync-dns `
  -SubscriptionId $SubscriptionId -PlatformSubscriptionId $PlatformSubscriptionId -ConfigurationPath $ConfigurationPath `
  -ConfirmDnsZone $dns.Zone -DnsAttempts 30 | Out-Null

# Use supported hostname operations against the existing app, not a full runtime deployment.
if ($phase -ne 'bind') {
  $domainProperty = $web.properties.configuration.ingress.PSObject.Properties['customDomains']
  $registered = @($(if ($domainProperty) { $domainProperty.Value }) | Where-Object { $null -ne $_ -and $_.name -eq $domain.hostname })
  if (-not $registered.Count) {
    Write-Host 'Registering the configured app hostname.'
    Invoke-AzJson @('containerapp', 'hostname', 'add', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup,
      '--name', $webName, '--hostname', $domain.hostname) | Out-Null
  }
  Write-Host 'Deploying the managed certificate template.'
  Invoke-AzJson @('deployment', 'group', 'create', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup,
    '--name', "certificate-$EnvironmentName", '--template-file', (Join-Path $PSScriptRoot '../../../infra/azure/bicep/main.web.certificate.rg.bicep'),
    '--parameters', "environmentName=$EnvironmentName", "location=$($configuration.primaryLocation)", "managedEnvironmentName=$managedEnvironmentName",
    "hostname=$($domain.hostname)", "organizationShortName=$($configuration.organizationShortName)", "workloadShortName=$($configuration.workloadShortName)") | Out-Null
}
Wait-WebManagedCertificate $certificateId $domain.hostname
if ($phase -ne 'bind') {
  Write-Host 'Binding the issued certificate to the configured hostname.'
  Invoke-AzJson @('containerapp', 'hostname', 'bind', '--subscription', "$SubscriptionId", '--resource-group', $resourceGroup,
    '--name', $webName, '--hostname', $domain.hostname, '--certificate', $certificateId) | Out-Null
}
$updatedWeb = Invoke-AzJson $webRead
$updatedBff = Invoke-AzJson $bffRead
if ((Get-DomainActivationProtectedState $updatedWeb) -cne $webState -or (Get-DomainActivationProtectedState $updatedBff) -cne $bffState) {
  throw 'Unexpected app configuration change detected. Inspect Azure; no automatic rollback was attempted.'
}
if ((Get-WebCustomDomainInitialPhase $updatedWeb $domain.hostname $certificateId) -ne 'bind') { throw 'HTTPS binding did not persist.' }
Wait-WebCustomDomainHealth $domain.hostname $EnvironmentName $build
[ordered]@{ action = $Action; hostname = $domain.hostname; build = $build; status = 'https-verified'; runtimePreserved = $true } | ConvertTo-Json
