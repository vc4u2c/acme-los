param zoneName string
param tags object = {}

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: zoneName
  location: 'global'
  tags: tags
}

output name string = privateDnsZone.name
output id string = privateDnsZone.id
