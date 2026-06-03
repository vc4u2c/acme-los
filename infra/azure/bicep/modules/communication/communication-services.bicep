param name string
param tags object = {}
param dataLocation string = 'United States'

resource communicationService 'Microsoft.Communication/communicationServices@2025-09-01' = {
  name: name
  location: 'global'
  tags: tags
  properties: {
    dataLocation: dataLocation
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

output name string = communicationService.name
output id string = communicationService.id
output endpoint string = 'https://${communicationService.name}.communication.azure.com'
