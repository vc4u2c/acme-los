targetScope = 'resourceGroup'

@allowed([
  'dev'
  'qa'
  'stg'
  'prod'
])
param environmentName string

param location string = resourceGroup().location
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param instanceNumber string = '01'
param ownerTag string = 'vc4u2c'
param costCenterTag string = 'playg'
param extraTags object = {}
param telemetryServiceName string = 'acme-los-web'
param alertEmailReceivers array = []
param workspaceRetentionInDays int = environmentName == 'prod' ? 60 : 30
param containerAppResourceId string = ''
param containerAppEnvironmentResourceId string = ''
param keyVaultResourceId string = ''
param keyVaultUri string = ''

var resolvedLogAnalyticsWorkspaceName = toLower('log-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedApplicationInsightsName = toLower('appi-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedActionGroupName = toLower('ag-${organizationShortName}-${workloadShortName}-ops-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedActionGroupShortName = substring('${organizationShortName}${workloadShortName}${environmentName}', 0, min(length('${organizationShortName}${workloadShortName}${environmentName}'), 12))
var resolvedWorkbookDisplayName = toLower('wbk-${organizationShortName}-${workloadShortName}-ops-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedWorkbookName = guid(resourceGroup().id, resolvedWorkbookDisplayName)
var requestFailuresAlertName = toLower('alrt-${organizationShortName}-${workloadShortName}-failed-requests-${environmentName}-${regionShortName}-${instanceNumber}')
var exceptionsAlertName = toLower('alrt-${organizationShortName}-${workloadShortName}-exceptions-${environmentName}-${regionShortName}-${instanceNumber}')
var authFailuresAlertName = toLower('alrt-${organizationShortName}-${workloadShortName}-auth-failures-${environmentName}-${regionShortName}-${instanceNumber}')
var systemErrorsAlertName = toLower('alrt-${organizationShortName}-${workloadShortName}-system-errors-${environmentName}-${regionShortName}-${instanceNumber}')
var failedRequestsThreshold = environmentName == 'prod' ? 5 : 2
var exceptionsThreshold = environmentName == 'prod' ? 3 : 1
var authFailuresThreshold = environmentName == 'prod' ? 5 : 2
var failureSeverity = environmentName == 'prod' ? 2 : 3
var exceptionSeverity = environmentName == 'prod' ? 2 : 3
var authSeverity = environmentName == 'prod' ? 2 : 3
var systemSeverity = environmentName == 'prod' ? 1 : 2
var deployOperationsPack = !empty(containerAppResourceId) && !empty(containerAppEnvironmentResourceId) && !empty(keyVaultResourceId) && !empty(keyVaultUri)
var resolvedContainerAppName = deployOperationsPack ? last(split(containerAppResourceId, '/')) : ''

var failedRequestsAlertQuery = '''
AppRequests
| where TimeGenerated > ago(10m)
| where AppRoleName =~ '${telemetryServiceName}' or AppRoleName endswith '.${telemetryServiceName}'
| summarize AlertValue=sumif(ItemCount, Success == false or tostring(ResultCode) startswith '5')
'''

var exceptionsAlertQuery = '''
AppExceptions
| where TimeGenerated > ago(10m)
| where AppRoleName =~ '${telemetryServiceName}' or AppRoleName endswith '.${telemetryServiceName}'
| summarize AlertValue=sum(ItemCount)
'''

var authFailuresAlertQuery = '''
AppTraces
| where TimeGenerated > ago(10m)
| where AppRoleName =~ '${telemetryServiceName}' or AppRoleName endswith '.${telemetryServiceName}'
| extend Audit=tostring(Properties.audit), Outcome=tostring(Properties.outcome)
| where Audit =~ 'true' and Outcome in ('failure', 'rate_limited')
| summarize AlertValue=sum(ItemCount)
'''

var systemErrorsAlertQuery = '''
union isfuzzy=true ContainerAppSystemLogs, ContainerAppSystemLogs_CL
| where TimeGenerated > ago(10m)
| extend ContainerApp=tostring(coalesce(column_ifexists('ContainerAppName', ''), column_ifexists('ContainerAppName_s', '')))
| where ContainerApp =~ '${resolvedContainerAppName}'
| extend LogLevel=tostring(coalesce(column_ifexists('LogLevel', ''), column_ifexists('LogLevel_s', ''))), Reason=tostring(coalesce(column_ifexists('Reason', ''), column_ifexists('Reason_s', '')))
| where LogLevel =~ 'Error' or Reason has_any ('Error', 'Failed', 'BackOff', 'Crash')
| summarize AlertValue=count()
'''

module tags './modules/foundation/tags.bicep' = {
  name: 'monitoring-tags-${environmentName}'
  params: {
    environmentName: environmentName
    applicationName: '${organizationShortName}-${workloadShortName}'
    owner: ownerTag
    costCenter: costCenterTag
    extraTags: union(extraTags, {
      Workload: 'operations'
      Criticality: environmentName == 'prod' ? 'high' : 'medium'
      Lifecycle: 'persistent'
    })
  }
}

module workspace './modules/monitoring/log-analytics-workspace.bicep' = {
  name: 'log-${environmentName}'
  params: {
    name: resolvedLogAnalyticsWorkspaceName
    location: location
    tags: tags.outputs.tags
    retentionInDays: workspaceRetentionInDays
  }
}

module appInsights './modules/monitoring/application-insights.bicep' = {
  name: 'appi-${environmentName}'
  params: {
    name: resolvedApplicationInsightsName
    location: location
    tags: tags.outputs.tags
    workspaceResourceId: workspace.outputs.id
  }
}

module actionGroup './modules/monitoring/action-group.bicep' = {
  name: 'ag-${environmentName}'
  params: {
    name: resolvedActionGroupName
    tags: tags.outputs.tags
    groupShortName: resolvedActionGroupShortName
    emailReceivers: alertEmailReceivers
  }
}

module failedRequestsAlert './modules/monitoring/scheduled-query-alert.bicep' = if (deployOperationsPack) {
  name: 'alert-failed-requests-${environmentName}'
  params: {
    name: requestFailuresAlertName
    location: location
    tags: tags.outputs.tags
    description: 'Alert when failed web requests spike for the ACME LOS ${environmentName} environment.'
    displayName: '${toUpper(environmentName)} failed requests spike'
    workspaceResourceId: workspace.outputs.id
    query: failedRequestsAlertQuery
    threshold: failedRequestsThreshold
    severity: failureSeverity
    actionGroupIds: [
      actionGroup.outputs.id
    ]
    customProperties: {
      environment: environmentName
      service: telemetryServiceName
      signal: 'failed-requests'
    }
  }
}

module exceptionsAlert './modules/monitoring/scheduled-query-alert.bicep' = if (deployOperationsPack) {
  name: 'alert-exceptions-${environmentName}'
  params: {
    name: exceptionsAlertName
    location: location
    tags: tags.outputs.tags
    description: 'Alert when exceptions spike for the ACME LOS ${environmentName} environment.'
    displayName: '${toUpper(environmentName)} exceptions spike'
    workspaceResourceId: workspace.outputs.id
    query: exceptionsAlertQuery
    threshold: exceptionsThreshold
    severity: exceptionSeverity
    actionGroupIds: [
      actionGroup.outputs.id
    ]
    customProperties: {
      environment: environmentName
      service: telemetryServiceName
      signal: 'exceptions'
    }
  }
}

module authFailuresAlert './modules/monitoring/scheduled-query-alert.bicep' = if (deployOperationsPack) {
  name: 'alert-auth-failures-${environmentName}'
  params: {
    name: authFailuresAlertName
    location: location
    tags: tags.outputs.tags
    description: 'Alert when auth or security failures spike for the ACME LOS ${environmentName} environment.'
    displayName: '${toUpper(environmentName)} auth failures spike'
    workspaceResourceId: workspace.outputs.id
    query: authFailuresAlertQuery
    threshold: authFailuresThreshold
    severity: authSeverity
    actionGroupIds: [
      actionGroup.outputs.id
    ]
    customProperties: {
      environment: environmentName
      service: telemetryServiceName
      signal: 'auth-failures'
    }
  }
}

module systemErrorsAlert './modules/monitoring/scheduled-query-alert.bicep' = if (deployOperationsPack) {
  name: 'alert-system-errors-${environmentName}'
  params: {
    name: systemErrorsAlertName
    location: location
    tags: tags.outputs.tags
    description: 'Alert when the Container Apps platform emits system errors for the ACME LOS ${environmentName} environment.'
    displayName: '${toUpper(environmentName)} container platform errors'
    workspaceResourceId: workspace.outputs.id
    query: systemErrorsAlertQuery
    threshold: 0
    severity: systemSeverity
    actionGroupIds: [
      actionGroup.outputs.id
    ]
    customProperties: {
      environment: environmentName
      service: telemetryServiceName
      signal: 'container-platform-errors'
      containerAppName: resolvedContainerAppName
    }
  }
}

output logAnalyticsWorkspaceName string = workspace.outputs.name
output logAnalyticsWorkspaceId string = workspace.outputs.id
output appInsightsName string = appInsights.outputs.name
output appInsightsId string = appInsights.outputs.id
output applicationInsightsConnectionString string = appInsights.outputs.connectionString
output actionGroupName string = actionGroup.outputs.name
output workbookDisplayName string = deployOperationsPack ? resolvedWorkbookDisplayName : ''
output workbookResourceName string = deployOperationsPack ? resolvedWorkbookName : ''
output workbookResourceId string = deployOperationsPack ? resourceId('Microsoft.Insights/workbooks', resolvedWorkbookName) : ''
output failedRequestsAlertName string = deployOperationsPack ? failedRequestsAlert!.outputs.name : ''
output exceptionsAlertName string = deployOperationsPack ? exceptionsAlert!.outputs.name : ''
output authFailuresAlertName string = deployOperationsPack ? authFailuresAlert!.outputs.name : ''
output systemErrorsAlertName string = deployOperationsPack ? systemErrorsAlert!.outputs.name : ''
