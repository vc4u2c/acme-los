targetScope = 'resourceGroup'

@allowed([
  'dev'
  'qa'
  'stg'
  'prod'
])
param environmentName string

param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param workloadVirtualNetworkId string
param keyVaultPrivateDnsZoneName string = 'privatelink.vaultcore.azure.net'
param managedRedisPrivateDnsZoneName string = 'privatelink.redis.azure.net'

var resolvedKeyVaultVirtualNetworkLinkName = toLower('pdzlnk-${organizationShortName}-${workloadShortName}-kv-${environmentName}-${regionShortName}-01')
var resolvedManagedRedisVirtualNetworkLinkName = toLower('pdzlnk-${organizationShortName}-${workloadShortName}-redis-${environmentName}-${regionShortName}-01')

resource keyVaultPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
  name: keyVaultPrivateDnsZoneName
}

resource managedRedisPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' existing = {
  name: managedRedisPrivateDnsZoneName
}

resource keyVaultVirtualNetworkLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: keyVaultPrivateDnsZone
  name: resolvedKeyVaultVirtualNetworkLinkName
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: workloadVirtualNetworkId
    }
  }
}

resource managedRedisVirtualNetworkLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: managedRedisPrivateDnsZone
  name: resolvedManagedRedisVirtualNetworkLinkName
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: workloadVirtualNetworkId
    }
  }
}

output keyVaultVirtualNetworkLinkName string = keyVaultVirtualNetworkLink.name
output managedRedisVirtualNetworkLinkName string = managedRedisVirtualNetworkLink.name
