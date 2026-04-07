param name string
param location string
param subnetId string
param privateLinkServiceId string
param groupIds array
param connectionName string = '${name}-conn'
param tags object = {}
param privateDnsZoneIds array = []

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: connectionName
        properties: {
          privateLinkServiceId: privateLinkServiceId
          groupIds: groupIds
        }
      }
    ]
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = if (length(privateDnsZoneIds) > 0) {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      for (zoneId, index) in privateDnsZoneIds: {
        name: 'zone-${index + 1}'
        properties: {
          privateDnsZoneId: zoneId
        }
      }
    ]
  }
}

output name string = privateEndpoint.name
output id string = privateEndpoint.id
