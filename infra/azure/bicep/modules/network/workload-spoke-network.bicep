param name string
param location string
param tags object = {}
param addressPrefixes array
param acaInfrastructureSubnetName string
param acaInfrastructureSubnetAddressPrefix string
param privateEndpointSubnetName string
param privateEndpointSubnetAddressPrefix string

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

resource acaInfrastructureSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: acaInfrastructureSubnetName
  properties: {
    addressPrefix: acaInfrastructureSubnetAddressPrefix
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

resource privateEndpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: privateEndpointSubnetName
  properties: {
    addressPrefix: privateEndpointSubnetAddressPrefix
    privateEndpointNetworkPolicies: 'Disabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
  }
}

output name string = virtualNetwork.name
output id string = virtualNetwork.id
output acaInfrastructureSubnetId string = acaInfrastructureSubnet.id
output acaInfrastructureSubnetName string = acaInfrastructureSubnet.name
output privateEndpointSubnetId string = privateEndpointSubnet.id
output privateEndpointSubnetName string = privateEndpointSubnet.name
