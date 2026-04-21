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
param platformMonitorResourceGroupName string = toLower('rg-${organizationShortName}-hub-monitor-${regionShortName}-${instanceNumber}')
@allowed([
  'file'
  'redis'
])
param stateStoreMode string = 'file'
param containerRegistryName string
param containerRegistryResourceGroupName string
param platformLogAnalyticsWorkspaceName string = toLower('log-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
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
var resolvedContainerAppEnvironmentName = toLower('cae-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedContainerAppEnvironmentInfrastructureResourceGroupName = toLower('rg-${organizationShortName}-${workloadShortName}-cae-infra-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedContainerAppName = toLower('ca-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedUserAssignedIdentityName = toLower('id-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedVirtualNetworkName = toLower('vnet-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedAppSubnetName = toLower('snet-${organizationShortName}-${workloadShortName}-app-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedDataSubnetName = toLower('snet-${organizationShortName}-${workloadShortName}-data-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedAppNetworkSecurityGroupName = toLower('nsg-${organizationShortName}-${workloadShortName}-app-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedDataNetworkSecurityGroupName = toLower('nsg-${organizationShortName}-${workloadShortName}-data-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedKeyVaultPrivateEndpointName = toLower('pep-${organizationShortName}-${workloadShortName}-kv-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedManagedRedisPrivateEndpointName = toLower('pep-${organizationShortName}-${workloadShortName}-redis-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedKeyVaultPrivateEndpointNetworkInterfaceName = toLower('nic-${organizationShortName}-${workloadShortName}-kv-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedManagedRedisPrivateEndpointNetworkInterfaceName = toLower('nic-${organizationShortName}-${workloadShortName}-redis-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedManagedRedisAccessPolicyAssignmentName = take(
  'aparedis${uniqueString(resolvedRedisClusterName, resolvedUserAssignedIdentityName)}',
  60
)
var resolvedRedisHostName = stateStoreMode == 'redis' ? redis!.outputs.hostName : ''
var resolvedRedisPort = stateStoreMode == 'redis' ? redis!.outputs.port : 0
var resolvedManagedRedisPrivateDnsZoneId = resourceId(
  platformSubscriptionId,
  platformNetworkResourceGroupName,
  'Microsoft.Network/privateDnsZones',
  managedRedisPrivateDnsZoneName
)
var resolvedKeyVaultDiagnosticSettingsName = toLower('diag-${organizationShortName}-${workloadShortName}-kv-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedManagedEnvironmentDiagnosticSettingsName = toLower('diag-${organizationShortName}-${workloadShortName}-cae-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedManagedRedisDiagnosticSettingsName = toLower('diag-${organizationShortName}-${workloadShortName}-redis-${environmentName}-${regionShortName}-${instanceNumber}')
var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource keyVaultPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
  scope: resourceGroup(platformSubscriptionId, platformNetworkResourceGroupName)
  name: keyVaultPrivateDnsZoneName
}

resource platformLogAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  scope: resourceGroup(platformSubscriptionId, platformMonitorResourceGroupName)
  name: platformLogAnalyticsWorkspaceName
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
    appSubnetName: resolvedAppSubnetName
    appSubnetAddressPrefix: acaInfrastructureSubnetAddressPrefix
    dataSubnetName: resolvedDataSubnetName
    dataSubnetAddressPrefix: privateEndpointSubnetAddressPrefix
    appNetworkSecurityGroupName: resolvedAppNetworkSecurityGroupName
    dataNetworkSecurityGroupName: resolvedDataNetworkSecurityGroupName
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

#disable-next-line no-unnecessary-dependson
module containerAppEnvironment './modules/web/container-app-environment.bicep' = {
  name: 'cae-${environmentName}'
  params: {
    name: resolvedContainerAppEnvironmentName
    location: location
    tags: tags.outputs.tags
    infrastructureSubnetId: workloadSpokeNetwork.outputs.appSubnetId
    logAnalyticsWorkspaceCustomerId: platformLogAnalyticsWorkspace.properties.customerId
    logAnalyticsWorkspaceSharedKey: platformLogAnalyticsWorkspace.listKeys().primarySharedKey
    workloadProfileName: acaWorkloadProfileName
    workloadProfileType: acaWorkloadProfileType
    minimumCount: acaWorkloadProfileMinimumCount
    maximumCount: acaWorkloadProfileMaximumCount
    infrastructureResourceGroup: resolvedContainerAppEnvironmentInfrastructureResourceGroupName
  }
}

resource managedEnvironmentResource 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: resolvedContainerAppEnvironmentName
}

#disable-next-line no-unnecessary-dependson
resource keyVaultDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: resolvedKeyVaultDiagnosticSettingsName
  scope: keyVaultResource
  dependsOn: [
    keyVault
  ]
  properties: {
    workspaceId: platformLogAnalyticsWorkspace.id
    logs: [
      {
        category: 'AuditEvent'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

#disable-next-line no-unnecessary-dependson
resource managedEnvironmentDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: resolvedManagedEnvironmentDiagnosticSettingsName
  scope: managedEnvironmentResource
  dependsOn: [
    containerAppEnvironment
  ]
  properties: {
    workspaceId: platformLogAnalyticsWorkspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

#disable-next-line no-unnecessary-dependson
resource managedRedisDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (stateStoreMode == 'redis') {
  name: resolvedManagedRedisDiagnosticSettingsName
  scope: redisEnterpriseResource
  dependsOn: [
    redis
  ]
  properties: {
    workspaceId: platformLogAnalyticsWorkspace.id
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

module keyVaultPrivateEndpoint './modules/network/private-endpoint.bicep' = {
  name: 'pep-kv-${environmentName}'
  params: {
    name: resolvedKeyVaultPrivateEndpointName
    location: location
    tags: tags.outputs.tags
    subnetId: workloadSpokeNetwork.outputs.dataSubnetId
    privateLinkServiceId: keyVault.outputs.id
    groupIds: [
      'vault'
    ]
    connectionName: '${resolvedKeyVaultPrivateEndpointName}-conn'
    customNetworkInterfaceName: resolvedKeyVaultPrivateEndpointNetworkInterfaceName
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
    subnetId: workloadSpokeNetwork.outputs.dataSubnetId
    privateLinkServiceId: redis!.outputs.id
    groupIds: [
      'redisEnterprise'
    ]
    connectionName: '${resolvedManagedRedisPrivateEndpointName}-conn'
    customNetworkInterfaceName: resolvedManagedRedisPrivateEndpointNetworkInterfaceName
    privateDnsZoneIds: [
      resolvedManagedRedisPrivateDnsZoneId
    ]
  }
}

resource redisEnterpriseResource 'Microsoft.Cache/redisEnterprise@2025-07-01' existing = if (stateStoreMode == 'redis') {
  name: resolvedRedisClusterName
}

resource redisDatabaseAccessPolicyAssignment 'Microsoft.Cache/redisEnterprise/databases/accessPolicyAssignments@2025-07-01' = if (stateStoreMode == 'redis') {
  name: '${resolvedRedisClusterName}/${resolvedRedisDatabaseName}/${resolvedManagedRedisAccessPolicyAssignmentName}'
  properties: {
    accessPolicyName: 'default'
    user: {
      objectId: userAssignedIdentity.outputs.principalId
    }
  }
  dependsOn: [
    redis
  ]
}

output containerAppEnvironmentName string = containerAppEnvironment.outputs.name
output containerAppEnvironmentId string = containerAppEnvironment.outputs.id
output containerAppEnvironmentInfrastructureResourceGroupName string = resolvedContainerAppEnvironmentInfrastructureResourceGroupName
output containerAppName string = resolvedContainerAppName
output containerAppLatestRevisionFqdn string = ''
output userAssignedIdentityName string = userAssignedIdentity.outputs.name
output userAssignedIdentityClientId string = userAssignedIdentity.outputs.clientId
output userAssignedIdentityResourceId string = userAssignedIdentity.outputs.id
output workloadVirtualNetworkName string = workloadSpokeNetwork.outputs.name
output workloadVirtualNetworkId string = workloadSpokeNetwork.outputs.id
output appSubnetName string = workloadSpokeNetwork.outputs.appSubnetName
output dataSubnetName string = workloadSpokeNetwork.outputs.dataSubnetName
output appNetworkSecurityGroupName string = workloadSpokeNetwork.outputs.appNetworkSecurityGroupName
output dataNetworkSecurityGroupName string = workloadSpokeNetwork.outputs.dataNetworkSecurityGroupName
output acaInfrastructureSubnetName string = workloadSpokeNetwork.outputs.appSubnetName
output privateEndpointSubnetName string = workloadSpokeNetwork.outputs.dataSubnetName
output keyVaultName string = keyVault.outputs.name
output keyVaultId string = keyVault.outputs.id
output keyVaultUri string = keyVault.outputs.vaultUri
output keyVaultPrivateEndpointName string = keyVaultPrivateEndpoint.outputs.name
output keyVaultPrivateEndpointNetworkInterfaceName string = resolvedKeyVaultPrivateEndpointNetworkInterfaceName
output logAnalyticsWorkspaceName string = platformLogAnalyticsWorkspace.name
output logAnalyticsWorkspaceId string = platformLogAnalyticsWorkspace.id
output containerRegistryName string = containerRegistryName
output containerRegistryResourceGroupName string = containerRegistryResourceGroupName
output redisClusterName string = stateStoreMode == 'redis' ? resolvedRedisClusterName : ''
output redisClusterId string = stateStoreMode == 'redis' ? redis!.outputs.id : ''
output redisDatabaseName string = stateStoreMode == 'redis' ? resolvedRedisDatabaseName : ''
output redisDatabaseId string = stateStoreMode == 'redis' ? redis!.outputs.databaseId : ''
output redisHostName string = stateStoreMode == 'redis' ? resolvedRedisHostName : ''
output redisPort int = stateStoreMode == 'redis' ? resolvedRedisPort : 0
output redisAccessPolicyAssignmentName string = stateStoreMode == 'redis'
  ? resolvedManagedRedisAccessPolicyAssignmentName
  : ''
output managedRedisPrivateEndpointName string = stateStoreMode == 'redis' ? resolvedManagedRedisPrivateEndpointName : ''
output managedRedisPrivateEndpointNetworkInterfaceName string = stateStoreMode == 'redis'
  ? resolvedManagedRedisPrivateEndpointNetworkInterfaceName
  : ''
