param name string
param location string
param tags object = {}
param logAnalyticsWorkspaceCustomerId string
@secure()
param logAnalyticsWorkspaceSharedKey string
param workloadProfileName string = 'consumption'
param workloadProfileType string = 'Consumption'
param minimumCount int = 0
param maximumCount int = 1
param infrastructureSubnetId string = ''
param infrastructureResourceGroup string = ''

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspaceCustomerId
        sharedKey: logAnalyticsWorkspaceSharedKey
      }
    }
    workloadProfiles: [
      workloadProfileType == 'Consumption'
        ? {
            name: workloadProfileName
            workloadProfileType: workloadProfileType
          }
        : {
            name: workloadProfileName
            workloadProfileType: workloadProfileType
            minimumCount: minimumCount
            maximumCount: maximumCount
          }
    ]
    vnetConfiguration: empty(infrastructureSubnetId) ? null : {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
    infrastructureResourceGroup: empty(infrastructureResourceGroup) ? null : infrastructureResourceGroup
  }
}

output name string = managedEnvironment.name
output id string = managedEnvironment.id
output defaultDomain string = managedEnvironment.properties.defaultDomain
output infrastructureResourceGroup string = infrastructureResourceGroup
