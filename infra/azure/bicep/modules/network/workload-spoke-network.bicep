param name string
param location string
param tags object = {}
param addressPrefixes array
param appSubnetName string
param appSubnetAddressPrefix string
param dataSubnetName string
param dataSubnetAddressPrefix string

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: addressPrefixes
    }
  }
}

resource appSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: appSubnetName
  properties: {
    addressPrefix: appSubnetAddressPrefix
    delegations: [
      {
        name: 'aca-environments'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
    privateEndpointNetworkPolicies: 'Enabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }
}

resource dataSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: dataSubnetName
  properties: {
    addressPrefix: dataSubnetAddressPrefix
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }
}

output name string = virtualNetwork.name
output id string = virtualNetwork.id
output appSubnetId string = appSubnet.id
output appSubnetName string = appSubnet.name
output dataSubnetId string = dataSubnet.id
output dataSubnetName string = dataSubnet.name
