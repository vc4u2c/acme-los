param name string
param location string
param tags object = {}
param skuName string = 'Basic'

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
  }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    dataEndpointEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

output name string = registry.name
output id string = registry.id
output loginServer string = registry.properties.loginServer
