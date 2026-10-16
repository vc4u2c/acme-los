targetScope = 'subscription'

param location string
param resourceGroupName string
param zoneName string
@minLength(36)
@maxLength(36)
param deploymentPrincipalId string

var tags = {
  'acme:application': 'acme-los'
  'acme:environment': 'shared'
  'acme:managed-by': 'bicep'
  'acme:owner': 'vc4u2c'
  'acme:provisioner': 'github-actions'
  'acme:cost-center': 'playg'
  'acme:lifecycle': 'retain'
}

// This platform resource group is deliberately outside all workload stacks.
resource dnsRg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module dns './modules/shared/public-dns.bicep' = {
  scope: dnsRg
  name: 'acme-los-public-dns'
  params: {
    zoneName: zoneName
    deploymentPrincipalId: deploymentPrincipalId
    tags: tags
  }
}

output zoneId string = dns.outputs.zoneId
output nameServers array = dns.outputs.nameServers
