using './main.web.rg.bicep'

param environmentName = 'qa'
param location = 'centralus'
param organizationShortName = 'acme'
param workloadShortName = 'los'
param regionShortName = 'cus'
param instanceNumber = '01'
param uniqueShortSuffix = 'v42c'
param ownerTag = 'vc4u2c'
param costCenterTag = 'playg'
param stateStoreMode = 'redis'
param tenantId = '00000000-0000-0000-0000-000000000000'
param platformSubscriptionId = '00000000-0000-0000-0000-000000000000'
param platformNetworkResourceGroupName = 'rg-acme-placeholder-network-cus-01'
param containerRegistryName = 'acrplaceholder'
param containerRegistryResourceGroupName = 'rg-acme-placeholder-images-cus-01'
param containerRegistryLoginServer = 'acrplaceholder.azurecr.io'
param containerImage = 'acrplaceholder.azurecr.io/acme-los-web:placeholder'
param workloadVnetAddressSpace = '10.21.0.0/24'
param acaInfrastructureSubnetAddressPrefix = '10.21.0.0/27'
param privateEndpointSubnetAddressPrefix = '10.21.0.32/27'
param containerCpu = '0.5'
param containerMemory = '1Gi'
param minReplicas = 0
param maxReplicas = 1
param extraTags = {
  'acme:okta-environment': 'qa'
}
