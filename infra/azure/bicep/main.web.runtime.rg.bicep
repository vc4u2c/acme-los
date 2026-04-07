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
param containerRegistryLoginServer string
param containerImage string
param applicationInsightsConnectionString string
param keyVaultName string
param keyVaultUri string
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
    stateStoreMode: stateStoreMode
    redisKeyPrefix: redisKeyPrefix
    applicationInsightsConnectionString: applicationInsightsConnectionString
    keyVaultUri: keyVaultUri
    targetPort: containerTargetPort
    containerCpu: containerCpu
    containerMemory: containerMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    redisSecretName: redisSecretName
    redisSecretKeyVaultUrl: redisSecretKeyVaultUrl
  }
  dependsOn: [
    redisConnectionSecret
  ]
}

output containerAppName string = containerApp.outputs.name
output containerAppLatestRevisionFqdn string = containerApp.outputs.latestRevisionFqdn
