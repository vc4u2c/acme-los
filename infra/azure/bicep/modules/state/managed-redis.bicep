param name string
param location string
param tags object = {}
param skuName string = 'Balanced_B0'
param databaseName string = 'default'
param clusteringPolicy string = 'NoCluster'
param evictionPolicy string = 'VolatileLRU'
param highAvailability string = 'Disabled'
param minimumTlsVersion string = '1.2'
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Disabled'

resource redisEnterprise 'Microsoft.Cache/redisEnterprise@2025-07-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  properties: {
    highAvailability: highAvailability
    minimumTlsVersion: minimumTlsVersion
    publicNetworkAccess: publicNetworkAccess
  }
}

resource defaultDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' = {
  parent: redisEnterprise
  name: databaseName
  properties: {
    accessKeysAuthentication: 'Enabled'
    clientProtocol: 'Encrypted'
    clusteringPolicy: clusteringPolicy
    evictionPolicy: evictionPolicy
    port: 10000
  }
}

output name string = redisEnterprise.name
output id string = redisEnterprise.id
output databaseName string = defaultDatabase.name
output databaseId string = defaultDatabase.id
output hostName string = redisEnterprise.properties.hostName
output port int = defaultDatabase.properties.port
output skuName string = skuName
output clusteringPolicy string = clusteringPolicy
