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
@allowed([
  'file'
  'redis'
])
param stateStoreMode string = 'file'
param managedEnvironmentId string
param userAssignedIdentityResourceId string
param appBuildId string
param authProvider string = 'okta'
param oktaEnvironmentName string = environmentName
param oktaIssuer string
param oktaClientId string
param oktaRedirectUri string
param oktaPostLogoutRedirectUri string
param oktaFundingAcrValues string = 'urn:okta:loa:2fa:any'
param containerRegistryLoginServer string
param containerImage string
param applicationInsightsConnectionString string
param logAnalyticsWorkspaceId string
param keyVaultName string
param keyVaultUri string
param sessionSecretName string = 'sec-acme-los-web-session-secret'
@secure()
param sessionSecretValue string
param redisClusterName string = ''
param redisDatabaseName string = 'default'
param redisHostName string = ''
param redisPort int = 0
param redisSecretName string = 'sec-acme-los-redis-url'
@secure()
param redisSecretKeyVaultUrl string = ''
param containerTargetPort int = 3000
param containerCpu string = '0.5'
param containerMemory string = '1Gi'
param minReplicas int = 0
param maxReplicas int = 1
param workloadProfileName string = 'consumption'

var resolvedContainerAppName = toLower('ca-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var redisKeyPrefix = '${organizationShortName}-${workloadShortName}:web:${environmentName}'
var resolvedContainerAppDiagnosticSettingsName = toLower('diag-${organizationShortName}-${workloadShortName}-ca-${environmentName}-${regionShortName}-${instanceNumber}')
var redisDatabaseResourceId = stateStoreMode == 'redis'
  ? resourceId('Microsoft.Cache/redisEnterprise/databases', redisClusterName, redisDatabaseName)
  : ''
var redisKeys = stateStoreMode == 'redis' ? listKeys(redisDatabaseResourceId, '2025-07-01') : {}
var redisConnectionString = stateStoreMode == 'redis'
  ? 'rediss://:${uriComponent(string(redisKeys.primaryKey))}@${redisHostName}:${redisPort}'
  : ''

resource keyVaultResource 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource sessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVaultResource
  name: sessionSecretName
  properties: {
    value: sessionSecretValue
  }
}

resource redisConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (stateStoreMode == 'redis') {
  parent: keyVaultResource
  name: redisSecretName
  properties: {
    value: redisConnectionString
  }
}

module tags './modules/foundation/tags.bicep' = {
  name: 'runtime-tags-${environmentName}'
  params: {
    environmentName: environmentName
    applicationName: '${organizationShortName}-${workloadShortName}'
    owner: ownerTag
    costCenter: costCenterTag
    extraTags: extraTags
  }
}

module containerApp './modules/web/container-app.bicep' = {
  name: 'ca-${environmentName}'
  params: {
    name: resolvedContainerAppName
    location: location
    tags: tags.outputs.tags
    managedEnvironmentId: managedEnvironmentId
    workloadProfileName: workloadProfileName
    userAssignedIdentityResourceId: userAssignedIdentityResourceId
    containerRegistryServer: containerRegistryLoginServer
    containerImage: containerImage
    appEnvironmentName: environmentName
    appBuildId: appBuildId
    authProvider: authProvider
    oktaEnvironmentName: oktaEnvironmentName
    oktaIssuer: oktaIssuer
    oktaClientId: oktaClientId
    oktaRedirectUri: oktaRedirectUri
    oktaPostLogoutRedirectUri: oktaPostLogoutRedirectUri
    oktaFundingAcrValues: oktaFundingAcrValues
    stateStoreMode: stateStoreMode
    redisKeyPrefix: redisKeyPrefix
    applicationInsightsConnectionString: applicationInsightsConnectionString
    keyVaultUri: keyVaultUri
    sessionSecretName: sessionSecretName
    sessionSecretKeyVaultUrl: '${keyVaultUri}secrets/${sessionSecretName}'
    targetPort: containerTargetPort
    containerCpu: containerCpu
    containerMemory: containerMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    redisSecretName: redisSecretName
    redisSecretKeyVaultUrl: redisSecretKeyVaultUrl
  }
  dependsOn: [
    sessionSecret
    redisConnectionSecret
  ]
}

resource containerAppResource 'Microsoft.App/containerApps@2025-01-01' existing = {
  name: resolvedContainerAppName
}

resource containerAppDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: resolvedContainerAppDiagnosticSettingsName
  scope: containerAppResource
  dependsOn: [
    containerApp
  ]
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output containerAppName string = containerApp.outputs.name
output containerAppId string = containerApp.outputs.id
output containerAppLatestRevisionFqdn string = containerApp.outputs.latestRevisionFqdn
