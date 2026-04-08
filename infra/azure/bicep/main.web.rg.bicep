targetScope = 'resourceGroup'

@allowed([
  'dev'
  'qa'
  'stg'
  'prod'
])
param environmentName string

param location string = resourceGroup().location
param tenantId string
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param instanceNumber string = '01'
param uniqueShortSuffix string = 'v42c'
param ownerTag string = 'vc4u2c'
param costCenterTag string = 'playg'
param platformSubscriptionId string
param platformNetworkResourceGroupName string
@allowed([
  'file'
  'redis'
])
param stateStoreMode string = 'file'
param containerRegistryName string
param containerRegistryResourceGroupName string
param redisSkuName string = 'Balanced_B0'
param redisClusteringPolicy string = 'NoCluster'
param acaWorkloadProfileName string = 'consumption'
param acaWorkloadProfileType string = 'Consumption'
param acaWorkloadProfileMinimumCount int = 0
param acaWorkloadProfileMaximumCount int = 1
param workloadVnetAddressSpace string
param acaInfrastructureSubnetAddressPrefix string
param privateEndpointSubnetAddressPrefix string
param keyVaultPrivateDnsZoneName string = 'privatelink.vaultcore.azure.net'
param managedRedisPrivateDnsZoneName string = 'privatelink.redis.azure.net'
param extraTags object = {}

var resolvedKeyVaultName = toLower('kv${organizationShortName}${workloadShortName}${environmentName}${regionShortName}${instanceNumber}${uniqueShortSuffix}')
var resolvedRedisClusterName = toLower('redis-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedRedisDatabaseName = 'default'
var resolvedLogAnalyticsWorkspaceName = toLower('log-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedApplicationInsightsName = toLower('appi-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedContainerAppEnvironmentName = toLower('cae-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedContainerAppName = toLower('ca-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedUserAssignedIdentityName = toLower('id-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedVirtualNetworkName = toLower('vnet-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedAcaInfrastructureSubnetName = toLower('snet-${organizationShortName}-${workloadShortName}-aca-infra-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedPrivateEndpointSubnetName = toLower('snet-${organizationShortName}-${workloadShortName}-pe-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedKeyVaultPrivateEndpointName = toLower('pep-${organizationShortName}-${workloadShortName}-kv-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedManagedRedisPrivateEndpointName = toLower('pep-${organizationShortName}-${workloadShortName}-redis-${environmentName}-${regionShortName}-${instanceNumber}')
var redisConnectionSecretName = 'sec-acme-los-redis-url'
var resolvedRedisHostName = stateStoreMode == 'redis' ? redis!.outputs.hostName : ''
var resolvedRedisPort = stateStoreMode == 'redis' ? redis!.outputs.port : 0
var resolvedManagedRedisPrivateDnsZoneId = resourceId(
  platformSubscriptionId,
  platformNetworkResourceGroupName,
  'Microsoft.Network/privateDnsZones',
  managedRedisPrivateDnsZoneName
)
var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource keyVaultPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
  scope: resourceGroup(platformSubscriptionId, platformNetworkResourceGroupName)
  name: keyVaultPrivateDnsZoneName
}

module tags './modules/foundation/tags.bicep' = {
  name: 'web-tags-${environmentName}'
  params: {
    environmentName: environmentName
    applicationName: '${organizationShortName}-${workloadShortName}'
    owner: ownerTag
    costCenter: costCenterTag
    extraTags: extraTags
  }
}

module workloadSpokeNetwork './modules/network/workload-spoke-network.bicep' = {
  name: 'network-${environmentName}'
  params: {
    name: resolvedVirtualNetworkName
    location: location
    tags: tags.outputs.tags
    addressPrefixes: [
      workloadVnetAddressSpace
    ]
    acaInfrastructureSubnetName: resolvedAcaInfrastructureSubnetName
    acaInfrastructureSubnetAddressPrefix: acaInfrastructureSubnetAddressPrefix
    privateEndpointSubnetName: resolvedPrivateEndpointSubnetName
    privateEndpointSubnetAddressPrefix: privateEndpointSubnetAddressPrefix
  }
}

module workspace './modules/monitoring/log-analytics-workspace.bicep' = {
  name: 'log-${environmentName}'
  params: {
    name: resolvedLogAnalyticsWorkspaceName
    location: location
    tags: tags.outputs.tags
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

module keyVault './modules/security/key-vault.bicep' = {
  name: 'kv-${environmentName}'
  params: {
    name: resolvedKeyVaultName
    location: location
    tenantId: tenantId
    tags: tags.outputs.tags
    publicNetworkAccess: 'Disabled'
    networkDefaultAction: 'Deny'
    networkBypass: 'None'
  }
}

resource keyVaultResource 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: resolvedKeyVaultName
}

module redis './modules/state/managed-redis.bicep' = if (stateStoreMode == 'redis') {
  name: 'redis-${environmentName}'
  params: {
    name: resolvedRedisClusterName
    location: location
    tags: tags.outputs.tags
    skuName: redisSkuName
    databaseName: resolvedRedisDatabaseName
    clusteringPolicy: redisClusteringPolicy
    publicNetworkAccess: 'Disabled'
  }
}

module userAssignedIdentity './modules/web/user-assigned-identity.bicep' = {
  name: 'id-${environmentName}'
  params: {
    name: resolvedUserAssignedIdentityName
    location: location
    tags: tags.outputs.tags
  }
}

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVaultResource.id, resolvedUserAssignedIdentityName, 'key-vault-secrets-user')
  scope: keyVaultResource
  properties: {
    principalId: userAssignedIdentity.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

module acrPullRoleAssignment './modules/shared/acr-pull-role-assignment.bicep' = {
  name: 'acr-pull-${environmentName}'
  scope: resourceGroup(subscription().subscriptionId, containerRegistryResourceGroupName)
  params: {
    registryName: containerRegistryName
    principalId: userAssignedIdentity.outputs.principalId
    principalNameSeed: resolvedUserAssignedIdentityName
  }
}

module containerAppEnvironment './modules/web/container-app-environment.bicep' = {
  name: 'cae-${environmentName}'
  params: {
    name: resolvedContainerAppEnvironmentName
    location: location
    tags: tags.outputs.tags
    infrastructureSubnetId: workloadSpokeNetwork.outputs.acaInfrastructureSubnetId
    logAnalyticsWorkspaceCustomerId: reference(
      resourceId('Microsoft.OperationalInsights/workspaces', resolvedLogAnalyticsWorkspaceName),
      '2023-09-01'
    ).customerId
    logAnalyticsWorkspaceSharedKey: listKeys(
      resourceId('Microsoft.OperationalInsights/workspaces', resolvedLogAnalyticsWorkspaceName),
      '2023-09-01'
    ).primarySharedKey
    workloadProfileName: acaWorkloadProfileName
    workloadProfileType: acaWorkloadProfileType
    minimumCount: acaWorkloadProfileMinimumCount
    maximumCount: acaWorkloadProfileMaximumCount
  }
}

module keyVaultPrivateEndpoint './modules/network/private-endpoint.bicep' = {
  name: 'pep-kv-${environmentName}'
  params: {
    name: resolvedKeyVaultPrivateEndpointName
    location: location
    tags: tags.outputs.tags
    subnetId: workloadSpokeNetwork.outputs.privateEndpointSubnetId
    privateLinkServiceId: keyVault.outputs.id
    groupIds: [
      'vault'
    ]
    connectionName: '${resolvedKeyVaultPrivateEndpointName}-conn'
    privateDnsZoneIds: [
      keyVaultPrivateDnsZone.id
    ]
  }
}

module managedRedisPrivateEndpoint './modules/network/private-endpoint.bicep' = if (stateStoreMode == 'redis') {
  name: 'pep-redis-${environmentName}'
  params: {
    name: resolvedManagedRedisPrivateEndpointName
    location: location
    tags: tags.outputs.tags
    subnetId: workloadSpokeNetwork.outputs.privateEndpointSubnetId
    privateLinkServiceId: redis!.outputs.id
    groupIds: [
      'redisEnterprise'
    ]
    connectionName: '${resolvedManagedRedisPrivateEndpointName}-conn'
    privateDnsZoneIds: [
      resolvedManagedRedisPrivateDnsZoneId
    ]
  }
}

output containerAppEnvironmentName string = containerAppEnvironment.outputs.name
output containerAppEnvironmentId string = containerAppEnvironment.outputs.id
output containerAppName string = resolvedContainerAppName
output containerAppLatestRevisionFqdn string = ''
output userAssignedIdentityName string = userAssignedIdentity.outputs.name
output userAssignedIdentityClientId string = userAssignedIdentity.outputs.clientId
output userAssignedIdentityResourceId string = userAssignedIdentity.outputs.id
output workloadVirtualNetworkName string = workloadSpokeNetwork.outputs.name
output workloadVirtualNetworkId string = workloadSpokeNetwork.outputs.id
output acaInfrastructureSubnetName string = workloadSpokeNetwork.outputs.acaInfrastructureSubnetName
output privateEndpointSubnetName string = workloadSpokeNetwork.outputs.privateEndpointSubnetName
output keyVaultName string = keyVault.outputs.name
output keyVaultUri string = keyVault.outputs.vaultUri
output keyVaultPrivateEndpointName string = keyVaultPrivateEndpoint.outputs.name
output appInsightsName string = appInsights.outputs.name
output applicationInsightsConnectionString string = appInsights.outputs.connectionString
output logAnalyticsWorkspaceName string = workspace.outputs.name
output containerRegistryName string = containerRegistryName
output containerRegistryResourceGroupName string = containerRegistryResourceGroupName
output redisClusterName string = stateStoreMode == 'redis' ? resolvedRedisClusterName : ''
output redisDatabaseName string = stateStoreMode == 'redis' ? resolvedRedisDatabaseName : ''
output redisDatabaseId string = stateStoreMode == 'redis' ? redis!.outputs.databaseId : ''
output redisHostName string = stateStoreMode == 'redis' ? resolvedRedisHostName : ''
output redisPort int = stateStoreMode == 'redis' ? resolvedRedisPort : 0
output redisConnectionSecretName string = stateStoreMode == 'redis' ? redisConnectionSecretName : ''
output managedRedisPrivateEndpointName string = stateStoreMode == 'redis' ? resolvedManagedRedisPrivateEndpointName : ''
