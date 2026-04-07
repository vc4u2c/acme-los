param name string
param location string
param tags object = {}
param skuName string = 'B1'
param skuTier string = 'Basic'
param reserved bool = true

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: reserved
  }
}

output name string = plan.name
output id string = plan.id
