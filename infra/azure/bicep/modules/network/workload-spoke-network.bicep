param name string
param location string
param tags object = {}
param addressPrefixes array
param appSubnetName string
param appSubnetAddressPrefix string
param dataSubnetName string
param dataSubnetAddressPrefix string
param appNetworkSecurityGroupName string
param dataNetworkSecurityGroupName string

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

resource appNetworkSecurityGroup 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: appNetworkSecurityGroupName
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'deny-data-subnet-inbound'
        properties: {
          access: 'Deny'
          direction: 'Inbound'
          priority: 200
          protocol: '*'
          sourceAddressPrefix: dataSubnetAddressPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

resource dataNetworkSecurityGroup 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: dataNetworkSecurityGroupName
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'allow-app-subnet-to-key-vault'
        properties: {
          access: 'Allow'
          direction: 'Inbound'
          priority: 100
          protocol: 'Tcp'
          sourceAddressPrefix: appSubnetAddressPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '443'
        }
      }
      {
        name: 'allow-app-subnet-to-managed-redis'
        properties: {
          access: 'Allow'
          direction: 'Inbound'
          priority: 110
          protocol: 'Tcp'
          sourceAddressPrefix: appSubnetAddressPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '10000'
        }
      }
      {
        name: 'deny-app-subnet-other-inbound'
        properties: {
          access: 'Deny'
          direction: 'Inbound'
          priority: 120
          protocol: '*'
          sourceAddressPrefix: appSubnetAddressPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
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
    networkSecurityGroup: {
      id: appNetworkSecurityGroup.id
    }
  }
}

resource dataSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: dataSubnetName
  properties: {
    addressPrefix: dataSubnetAddressPrefix
    privateEndpointNetworkPolicies: 'NetworkSecurityGroupEnabled'
    privateLinkServiceNetworkPolicies: 'Enabled'
    networkSecurityGroup: {
      id: dataNetworkSecurityGroup.id
    }
  }
}

output name string = virtualNetwork.name
output id string = virtualNetwork.id
output appSubnetId string = appSubnet.id
output appSubnetName string = appSubnet.name
output dataSubnetId string = dataSubnet.id
output dataSubnetName string = dataSubnet.name
output appNetworkSecurityGroupId string = appNetworkSecurityGroup.id
output appNetworkSecurityGroupName string = appNetworkSecurityGroup.name
output dataNetworkSecurityGroupId string = dataNetworkSecurityGroup.id
output dataNetworkSecurityGroupName string = dataNetworkSecurityGroup.name
