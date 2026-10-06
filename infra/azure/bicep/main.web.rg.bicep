targetScope = 'resourceGroup'

@allowed([
  'dev'
  'qa'
  'stg'
  'prod'
])
param environmentName string

@description('Dev splits retained services from disposable runtime without changing their resource IDs.')
@allowed([
  'all'
  'retained'
  'disposable'
])
param resourcePhase string = 'all'

param location string = resourceGroup().location
param tenantId string
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param retainedRegionShortName string = regionShortName
param retainedResourceGroupName string = resourceGroup().name
@description('Stable name for the global ACS resource when its resource group moves regions.')
param globalCommunicationServicesName string = toLower('acs-${organizationShortName}-${workloadShortName}-${environmentName}-${retainedRegionShortName}-${instanceNumber}')
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

var deployRetained = resourcePhase != 'disposable'
var deployRegionalNetwork = resourcePhase == 'disposable' && retainedResourceGroupName != resourceGroup().name
var deployDisposable = resourcePhase != 'retained'
var deployRedis = deployDisposable && stateStoreMode == 'redis'

var resolvedKeyVaultName = toLower('kv${organizationShortName}${workloadShortName}${environmentName}${retainedRegionShortName}${instanceNumber}${uniqueShortSuffix}')
var resolvedRedisClusterName = toLower('redis-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedRedisDatabaseName = 'default'
var resolvedContainerAppEnvironmentName = toLower('cae-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedContainerAppEnvironmentInfrastructureResourceGroupName = toLower('rg-${organizationShortName}-${workloadShortName}-cae-infra-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedContainerAppName = toLower('ca-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedCommunicationServicesName = globalCommunicationServicesName
var resolvedUserAssignedIdentityName = toLower('id-${organizationShortName}-${workloadShortName}-web-${environmentName}-${retainedRegionShortName}-${instanceNumber}')
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
var resolvedRedisHostName = deployRedis ? redis!.outputs.hostName : ''
var resolvedRedisPort = deployRedis ? redis!.outputs.port : 0
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
var contributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'b24988ac-6180-42a0-ab88-20f7382dd24c'
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

module workloadSpokeNetwork './modules/network/workload-spoke-network.bicep' = if (deployRetained || deployRegionalNetwork) {
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

module keyVault './modules/security/key-vault.bicep' = if (deployRetained) {
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

module redis './modules/state/managed-redis.bicep' = if (deployRedis) {
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
  // Allocate the capacity-sensitive ACA environment before the paid state service.
  dependsOn: [
    containerAppEnvironment
  ]
}

module userAssignedIdentity './modules/web/user-assigned-identity.bicep' = if (deployRetained) {
  name: 'id-${environmentName}'
  params: {
    name: resolvedUserAssignedIdentityName
    location: location
    tags: tags.outputs.tags
  }
}

module communicationServices './modules/communication/communication-services.bicep' = if (deployRetained) {
  name: 'acs-${environmentName}'
  params: {
    name: resolvedCommunicationServicesName
    tags: tags.outputs.tags
  }
}

resource communicationServicesResource 'Microsoft.Communication/communicationServices@2025-09-01' existing = {
  name: resolvedCommunicationServicesName
}

resource retainedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  scope: resourceGroup(retainedResourceGroupName)
  name: resolvedUserAssignedIdentityName
}

resource runtimeKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  scope: resourceGroup(retainedResourceGroupName)
  name: resolvedKeyVaultName
}

resource runtimeCommunicationServices 'Microsoft.Communication/communicationServices@2025-09-01' existing = {
  scope: resourceGroup(retainedResourceGroupName)
  name: resolvedCommunicationServicesName
}

resource retainedNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' existing = {
  name: resolvedVirtualNetworkName
}

var identityPrincipalId = deployRetained ? userAssignedIdentity!.outputs.principalId : retainedIdentity.properties.principalId
var identityClientId = deployRetained ? userAssignedIdentity!.outputs.clientId : retainedIdentity.properties.clientId
var appSubnetId = deployRetained || deployRegionalNetwork ? workloadSpokeNetwork!.outputs.appSubnetId : '${retainedNetwork.id}/subnets/${resolvedAppSubnetName}'
var dataSubnetId = deployRetained || deployRegionalNetwork ? workloadSpokeNetwork!.outputs.dataSubnetId : '${retainedNetwork.id}/subnets/${resolvedDataSubnetName}'

resource communicationServicesContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployRetained) {
  name: guid(communicationServicesResource.id, resolvedUserAssignedIdentityName, 'communication-services-contributor')
  scope: communicationServicesResource
  properties: {
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleDefinitionId
  }
  dependsOn: [
    communicationServices
  ]
}

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployRetained) {
  name: guid(keyVaultResource.id, resolvedUserAssignedIdentityName, 'key-vault-secrets-user')
  scope: keyVaultResource
  properties: {
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
  dependsOn: [
    keyVault
  ]
}

module acrPullRoleAssignment './modules/shared/acr-pull-role-assignment.bicep' = if (deployRetained) {
  name: 'acr-pull-${environmentName}'
  scope: resourceGroup(subscription().subscriptionId, containerRegistryResourceGroupName)
  params: {
    registryName: containerRegistryName
    principalId: identityPrincipalId
    principalNameSeed: resolvedUserAssignedIdentityName
  }
}

#disable-next-line no-unnecessary-dependson
module containerAppEnvironment './modules/web/container-app-environment.bicep' = if (deployDisposable) {
  name: 'cae-${environmentName}'
  params: {
    name: resolvedContainerAppEnvironmentName
    location: location
    tags: tags.outputs.tags
    infrastructureSubnetId: appSubnetId
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
resource keyVaultDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployRetained) {
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
resource managedEnvironmentDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployDisposable) {
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
resource managedRedisDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployRedis) {
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

module keyVaultPrivateEndpoint './modules/network/private-endpoint.bicep' = if (deployDisposable) {
  name: 'pep-kv-${environmentName}'
  params: {
    name: resolvedKeyVaultPrivateEndpointName
    location: location
    tags: tags.outputs.tags
    subnetId: dataSubnetId
    privateLinkServiceId: deployRetained ? keyVault!.outputs.id : runtimeKeyVault.id
    groupIds: [
      'vault'
    ]
    connectionName: '${resolvedKeyVaultPrivateEndpointName}-conn'
    customNetworkInterfaceName: resolvedKeyVaultPrivateEndpointNetworkInterfaceName
    privateDnsZoneIds: [
      keyVaultPrivateDnsZone.id
    ]
  }
  dependsOn: [
    containerAppEnvironment
  ]
}

module managedRedisPrivateEndpoint './modules/network/private-endpoint.bicep' = if (deployRedis) {
  name: 'pep-redis-${environmentName}'
  params: {
    name: resolvedManagedRedisPrivateEndpointName
    location: location
    tags: tags.outputs.tags
    subnetId: dataSubnetId
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

resource redisEnterpriseResource 'Microsoft.Cache/redisEnterprise@2025-07-01' existing = if (deployRedis) {
  name: resolvedRedisClusterName
}

resource redisDatabaseAccessPolicyAssignment 'Microsoft.Cache/redisEnterprise/databases/accessPolicyAssignments@2025-07-01' = if (deployRedis) {
  name: '${resolvedRedisClusterName}/${resolvedRedisDatabaseName}/${resolvedManagedRedisAccessPolicyAssignmentName}'
  properties: {
    accessPolicyName: 'default'
    user: {
      objectId: identityPrincipalId
    }
  }
  dependsOn: [
    redis
  ]
}

output resourcePhase string = resourcePhase
output containerAppEnvironmentName string = deployDisposable ? containerAppEnvironment!.outputs.name : ''
output containerAppEnvironmentId string = deployDisposable ? containerAppEnvironment!.outputs.id : ''
output containerAppEnvironmentInfrastructureResourceGroupName string = resolvedContainerAppEnvironmentInfrastructureResourceGroupName
output containerAppName string = resolvedContainerAppName
output containerAppLatestRevisionFqdn string = ''
output userAssignedIdentityName string = resolvedUserAssignedIdentityName
output userAssignedIdentityClientId string = identityClientId
output userAssignedIdentityPrincipalId string = identityPrincipalId
output userAssignedIdentityResourceId string = retainedIdentity.id
output workloadVirtualNetworkName string = resolvedVirtualNetworkName
output workloadVirtualNetworkId string = retainedNetwork.id
output appSubnetName string = resolvedAppSubnetName
output dataSubnetName string = resolvedDataSubnetName
output appNetworkSecurityGroupName string = resolvedAppNetworkSecurityGroupName
output dataNetworkSecurityGroupName string = resolvedDataNetworkSecurityGroupName
output acaInfrastructureSubnetName string = resolvedAppSubnetName
output privateEndpointSubnetName string = resolvedDataSubnetName
output keyVaultName string = resolvedKeyVaultName
output keyVaultId string = runtimeKeyVault.id
output keyVaultUri string = deployRetained ? keyVault!.outputs.vaultUri : runtimeKeyVault.properties.vaultUri
output keyVaultPrivateEndpointName string = deployDisposable ? keyVaultPrivateEndpoint!.outputs.name : ''
output keyVaultPrivateEndpointNetworkInterfaceName string = resolvedKeyVaultPrivateEndpointNetworkInterfaceName
output communicationServicesName string = resolvedCommunicationServicesName
output communicationServicesId string = runtimeCommunicationServices.id
output communicationServicesEndpoint string = 'https://${resolvedCommunicationServicesName}.communication.azure.com'
output logAnalyticsWorkspaceName string = platformLogAnalyticsWorkspace.name
output logAnalyticsWorkspaceId string = platformLogAnalyticsWorkspace.id
output containerRegistryName string = containerRegistryName
output containerRegistryResourceGroupName string = containerRegistryResourceGroupName
output redisClusterName string = deployRedis ? resolvedRedisClusterName : ''
output redisClusterId string = deployRedis ? redis!.outputs.id : ''
output redisDatabaseName string = deployRedis ? resolvedRedisDatabaseName : ''
output redisDatabaseId string = deployRedis ? redis!.outputs.databaseId : ''
output redisHostName string = resolvedRedisHostName
output redisPort int = resolvedRedisPort
output redisAccessPolicyAssignmentName string = deployRedis
  ? resolvedManagedRedisAccessPolicyAssignmentName
  : ''
output managedRedisPrivateEndpointName string = deployRedis ? resolvedManagedRedisPrivateEndpointName : ''
output managedRedisPrivateEndpointNetworkInterfaceName string = deployRedis
  ? resolvedManagedRedisPrivateEndpointNetworkInterfaceName
  : ''
