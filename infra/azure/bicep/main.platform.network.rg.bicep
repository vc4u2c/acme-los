targetScope = 'resourceGroup'

param tags object = {}
param keyVaultPrivateDnsZoneName string = 'privatelink.vaultcore.azure.net'
param managedRedisPrivateDnsZoneName string = 'privatelink.redis.azure.net'

module keyVaultPrivateDnsZone './modules/network/private-dns-zone.bicep' = {
  name: 'pdz-keyvault'
  params: {
    zoneName: keyVaultPrivateDnsZoneName
    tags: tags
  }
}

module managedRedisPrivateDnsZone './modules/network/private-dns-zone.bicep' = {
  name: 'pdz-managed-redis'
  params: {
    zoneName: managedRedisPrivateDnsZoneName
    tags: tags
  }
}

output keyVaultPrivateDnsZoneName string = keyVaultPrivateDnsZone.outputs.name
output keyVaultPrivateDnsZoneId string = keyVaultPrivateDnsZone.outputs.id
output managedRedisPrivateDnsZoneName string = managedRedisPrivateDnsZone.outputs.name
output managedRedisPrivateDnsZoneId string = managedRedisPrivateDnsZone.outputs.id
