targetScope = 'subscription'

@allowed([
  'dev'
  'qa'
  'stg'
  'prod'
])
param environmentName string

param location string
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param instanceNumber string = '01'
param uniqueShortSuffix string = 'v42c'
param ownerTag string = 'vc4u2c'
param costCenterTag string = 'playg'
param extraTags object = {}

var workloadTags = union({
  'acme:application': '${organizationShortName}-${workloadShortName}'
  'acme:environment': environmentName
  'acme:managed-by': 'bicep'
  'acme:owner': ownerTag
  'acme:provisioner': 'github-actions'
  'acme:cost-center': costCenterTag
}, extraTags)

var workloadResourceGroupName = toLower('rg-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var deploymentStackName = toLower('stk-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var containerAppName = toLower('ca-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var keyVaultName = toLower('kv${organizationShortName}${workloadShortName}${environmentName}${regionShortName}${instanceNumber}${uniqueShortSuffix}')

resource workloadRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: workloadResourceGroupName
  location: location
  tags: workloadTags
}

output resourceGroupName string = workloadRg.name
output deploymentStackName string = deploymentStackName
output containerAppName string = containerAppName
output keyVaultName string = keyVaultName
