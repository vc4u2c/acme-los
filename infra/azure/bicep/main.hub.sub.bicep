targetScope = 'subscription'

param location string
param organizationShortName string = 'acme'
param regionShortName string = 'cus'
param instanceNumber string = '01'
param ownerTag string = 'vc4u2c'
param costCenterTag string = 'playg'
param extraTags object = {}

var hubTags = union({
  'acme:application': '${organizationShortName}-platform'
  'acme:environment': 'shared'
  'acme:managed-by': 'bicep'
  'acme:owner': ownerTag
  'acme:provisioner': 'github-actions'
  'acme:cost-center': costCenterTag
}, extraTags)

var edgeResourceGroupName = toLower('rg-${organizationShortName}-hub-edge-${regionShortName}-${instanceNumber}')
var monitorResourceGroupName = toLower('rg-${organizationShortName}-hub-monitor-${regionShortName}-${instanceNumber}')
var networkResourceGroupName = toLower('rg-${organizationShortName}-hub-network-${regionShortName}-${instanceNumber}')

resource edgeRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: edgeResourceGroupName
  location: location
  tags: hubTags
}

resource monitorRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: monitorResourceGroupName
  location: location
  tags: hubTags
}

resource networkRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: networkResourceGroupName
  location: location
  tags: hubTags
}

output edgeResourceGroupName string = edgeRg.name
output monitorResourceGroupName string = monitorRg.name
output networkResourceGroupName string = networkRg.name
