[CmdletBinding()]
param(
  [ValidateSet('show-plan', 'apply')]
  [string]$Action = 'show-plan',
  [string]$PlatformSubscriptionId,
  [string]$DeploymentPrincipalId,
  [string]$ConfirmDnsZone,
  [string]$ConfigurationPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $ConfigurationPath) { $ConfigurationPath = Join-Path $PSScriptRoot '../../../infra/azure/config/platform.json' }
. (Join-Path $PSScriptRoot 'azure-dns.ps1')

$configuration = Get-Content -Raw -LiteralPath $ConfigurationPath | ConvertFrom-Json
$dns = Get-AzureWebDnsConfiguration $configuration 'dev' $PlatformSubscriptionId
$plan = [ordered]@{
  subscriptionId = $dns.SubscriptionId
  resourceGroup = $dns.ResourceGroup
  zone = $dns.Zone
  hostname = $dns.Hostname
  retention = 'Persistent platform zone; protected from deletion and outside workload stacks.'
  role = 'DNS Zone Contributor for the existing dev deployment service principal, scoped only to this child zone.'
  activation = 'Manual NS delegation at Namecheap is required. Apps, Okta, and CD remain unchanged.'
}
if ($Action -eq 'show-plan') { $plan | ConvertTo-Json; return }
if ($ConfirmDnsZone -cne $dns.Zone) { throw 'ConfirmDnsZone must exactly match the dedicated child zone.' }
if ($DeploymentPrincipalId -notmatch '^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$') {
  throw 'Provide the object ID of the existing dev deployment service principal, not its client ID.'
}
$account = Invoke-AzureDnsJson @('account', 'show', '--subscription', $dns.SubscriptionId)
if ($account.name -cne $configuration.subscriptions.platform) { throw 'Public DNS must be deployed to the configured platform subscription.' }
$group = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', "https://management.azure.com/subscriptions/$($dns.SubscriptionId)/resourceGroups/$($dns.ResourceGroup)?api-version=2024-03-01") -AllowMissing
if ($group -and ($group.tags.'acme:application' -cne 'acme-los' -or $group.tags.'acme:lifecycle' -cne 'retain')) {
  throw 'The DNS resource group already exists but is not a retained ACME LOS group. Refusing to adopt it.'
}
$principal = Invoke-AzureDnsJson @('ad', 'sp', 'show', '--id', $DeploymentPrincipalId)
if ($principal.id -ine $DeploymentPrincipalId -or $principal.displayName -cne "gha-$($configuration.projectName)-dev") {
  throw 'The DNS writer must be the existing ACME LOS dev deployment service principal.'
}
$existing = Get-AzureWebDnsZone $dns -AllowMissing
$publicNs = @(Get-WebPublicNameServers $dns.Zone)
if (-not $existing -and $publicNs.Count -gt 0) { throw 'This subdomain is already delegated. Do not replace its authoritative zone without a migration review.' }
if ($existing -and $publicNs.Count -gt 0) { Assert-AzureWebDnsDelegation $dns $existing }

$deployment = Invoke-AzureDnsJson @(
  'deployment', 'sub', 'create', '--subscription', $dns.SubscriptionId,
  '--location', $configuration.primaryLocation, '--name', 'acme-los-public-dns',
  '--template-file', (Join-Path $PSScriptRoot '../../../infra/azure/bicep/main.public-dns.sub.bicep'),
  '--parameters', "location=$($configuration.primaryLocation)", "resourceGroupName=$($dns.ResourceGroup)",
  "zoneName=$($dns.Zone)", "deploymentPrincipalId=$DeploymentPrincipalId"
)
if ($deployment.properties.provisioningState -ne 'Succeeded') { throw 'Azure public DNS bootstrap did not succeed.' }
$zone = Get-AzureWebDnsZone $dns
$plan.namecheapRecords = @($zone.properties.nameServers | ForEach-Object {
  [ordered]@{ type = 'NS'; host = ($dns.Zone -replace '\.[^.]+\.[^.]+$', ''); value = $_; ttl = 'Automatic' }
})
$plan | ConvertTo-Json -Depth 5
