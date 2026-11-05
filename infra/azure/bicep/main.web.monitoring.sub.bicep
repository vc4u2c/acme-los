targetScope = 'subscription'

param location string
param regionShortName string

resource monitorGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-acme-hub-monitor-${regionShortName}-01'
  location: location
  tags: {
    'acme:application': 'acme-platform'
    'acme:environment': 'shared'
    'acme:managed-by': 'bicep'
    'acme:owner': 'vc4u2c'
  }
}

output resourceGroupName string = monitorGroup.name
