[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PlatformSubscriptionId,

  [Parameter(Mandatory = $true)]
  [string]$PlatformMonitorResourceGroupName,

  [Parameter(Mandatory = $true)]
  [string]$WorkbookResourceName,

  [Parameter(Mandatory = $true)]
  [string]$WorkbookDisplayName,

  [Parameter(Mandatory = $true)]
  [string]$ApplicationInsightsResourceId,

  [Parameter(Mandatory = $true)]
  [string]$WorkspaceResourceId,

  [Parameter(Mandatory = $true)]
  [string]$ContainerAppResourceId,

  [Parameter(Mandatory = $true)]
  [string]$ContainerAppEnvironmentResourceId,

  [Parameter(Mandatory = $true)]
  [string]$KeyVaultResourceId,

  [Parameter(Mandatory = $true)]
  [string]$KeyVaultUri,

  [string]$RedisResourceId = '',
  [string]$RedisName = '',
  [string]$TelemetryServiceName = 'acme-los-web',
  [string]$Location = 'centralus',
  [string]$TemplateFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $TemplateFile) {
  $TemplateFile = Join-Path $PSScriptRoot '..\..\..\infra\azure\bicep\modules\monitoring\workbook-template.json'
}

function Test-RequiredCommand {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

Test-RequiredCommand -Name 'az'

if (-not (Test-Path -LiteralPath $TemplateFile)) {
  throw "Workbook template '$TemplateFile' was not found."
}

$resolvedContainerAppName = ($ContainerAppResourceId -split '/')[-1]
$template = Get-Content -Raw -Path $TemplateFile
$resolvedTemplate = $template.
  Replace('__WORKSPACE_RESOURCE_ID__', $WorkspaceResourceId).
  Replace('__APPLICATION_INSIGHTS_RESOURCE_ID__', $ApplicationInsightsResourceId).
  Replace('__CONTAINER_APP_RESOURCE_ID__', $ContainerAppResourceId).
  Replace('__CONTAINER_APP_ENVIRONMENT_RESOURCE_ID__', $ContainerAppEnvironmentResourceId).
  Replace('__KEY_VAULT_RESOURCE_ID__', $KeyVaultResourceId).
  Replace('__KEY_VAULT_URI__', $KeyVaultUri).
  Replace('__REDIS_RESOURCE_ID__', $RedisResourceId).
  Replace('__REDIS_NAME__', $RedisName).
  Replace('__TELEMETRY_SERVICE_NAME__', $TelemetryServiceName).
  Replace('__CONTAINER_APP_NAME__', $resolvedContainerAppName)

$payload = @{
  kind = 'shared'
  location = $Location
  properties = @{
    displayName = $WorkbookDisplayName
    sourceId = $ApplicationInsightsResourceId
    category = 'workbook'
    serializedData = $resolvedTemplate
    version = 'Notebook/1.0'
  }
}

$payloadPath = Join-Path ([System.IO.Path]::GetTempPath()) ("acme-los-workbook-" + [guid]::NewGuid().ToString('N') + '.json')

try {
  $payload | ConvertTo-Json -Depth 40 | Set-Content -Path $payloadPath -Encoding utf8

  az rest `
    --method put `
    --headers 'Content-Type=application/json' `
    --url "https://management.azure.com/subscriptions/$PlatformSubscriptionId/resourceGroups/$PlatformMonitorResourceGroupName/providers/Microsoft.Insights/workbooks/${WorkbookResourceName}?api-version=2023-06-01" `
    --body "@$payloadPath" `
    --only-show-errors `
    --output none

  [ordered]@{
    workbookResourceName = $WorkbookResourceName
    workbookDisplayName = $WorkbookDisplayName
    platformSubscriptionId = $PlatformSubscriptionId
    platformMonitorResourceGroupName = $PlatformMonitorResourceGroupName
  } | ConvertTo-Json -Depth 3
} finally {
  Remove-Item -LiteralPath $payloadPath -Force -ErrorAction SilentlyContinue
}
