param name string
param location string
param tenantId string
param tags object = {}
param enablePurgeProtection bool = true
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Disabled'
@allowed([
  'Allow'
  'Deny'
])
param networkDefaultAction string = 'Deny'
@allowed([
  'AzureServices'
  'None'
])
param networkBypass string = 'None'

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: enablePurgeProtection
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    sku: {
      family: 'A'
      name: 'standard'
    }
    publicNetworkAccess: publicNetworkAccess
    networkAcls: {
      bypass: networkBypass
      defaultAction: networkDefaultAction
    }
  }
}

output name string = vault.name
output id string = vault.id
output vaultUri string = vault.properties.vaultUri
