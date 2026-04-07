targetScope = 'resourceGroup'

@allowed([
  'nonprod'
  'prod'
])
param subscriptionRole string

param location string = resourceGroup().location
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param instanceNumber string = '01'
param uniqueShortSuffix string = 'v42c'
param ownerTag string = 'vc4u2c'
param costCenterTag string = 'playg'
param registrySkuName string = 'Basic'
param extraTags object = {}

var registryName = toLower('acr${organizationShortName}${workloadShortName}${subscriptionRole}${regionShortName}${instanceNumber}${uniqueShortSuffix}')

module tags './modules/foundation/tags.bicep' = {
  name: 'images-tags-${subscriptionRole}'
  params: {
    environmentName: subscriptionRole
    applicationName: '${organizationShortName}-${workloadShortName}'
    owner: ownerTag
    costCenter: costCenterTag
    extraTags: union({
      'acme:lifecycle': 'persistent'
    }, extraTags)
  }
}

module registry './modules/shared/container-registry.bicep' = {
  name: 'acr-${subscriptionRole}'
  params: {
    name: registryName
    location: location
    tags: tags.outputs.tags
    skuName: registrySkuName
  }
}

output containerRegistryName string = registry.outputs.name
output containerRegistryId string = registry.outputs.id
output containerRegistryLoginServer string = registry.outputs.loginServer
