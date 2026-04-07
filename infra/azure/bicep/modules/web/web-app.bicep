param name string
param location string
param tags object = {}
param serverFarmId string
param linuxFxVersion string = 'NODE|22-lts'
param httpsOnly bool = true
param alwaysOn bool = true
param appSettings object = {}

var resolvedAppSettings = [for setting in items(appSettings): {
  name: setting.key
  value: '${setting.value}'
}]

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: serverFarmId
    httpsOnly: httpsOnly
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      minTlsVersion: '1.2'
      alwaysOn: alwaysOn
      ftpsState: 'Disabled'
      http20Enabled: true
      appSettings: resolvedAppSettings
    }
  }
}

output name string = site.name
output id string = site.id
output defaultHostname string = site.properties.defaultHostName
output principalId string = site.identity.principalId
