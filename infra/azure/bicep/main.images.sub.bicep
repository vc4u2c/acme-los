targetScope = 'subscription'

@allowed([
  'nonprod'
  'prod'
])
param subscriptionRole string

param location string
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param instanceNumber string = '01'
param ownerTag string = 'vc4u2c'
param costCenterTag string = 'playg'
param extraTags object = {}

var sharedTags = union({
  'acme:application': '${organizationShortName}-${workloadShortName}'
  'acme:environment': subscriptionRole
  'acme:lifecycle': 'persistent'
  'acme:managed-by': 'bicep'
  'acme:owner': ownerTag
  'acme:provisioner': 'github-actions'
  'acme:cost-center': costCenterTag
}, extraTags)

var imagesResourceGroupName = toLower('rg-${organizationShortName}-${workloadShortName}-images-${subscriptionRole}-${regionShortName}-${instanceNumber}')
var deploymentStackName = toLower('stk-${organizationShortName}-${workloadShortName}-images-${subscriptionRole}-${regionShortName}-${instanceNumber}')

resource imagesRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: imagesResourceGroupName
  location: location
  tags: sharedTags
}

output resourceGroupName string = imagesRg.name
output deploymentStackName string = deploymentStackName
