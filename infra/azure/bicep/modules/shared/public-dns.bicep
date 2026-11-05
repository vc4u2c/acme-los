param zoneName string
param deploymentPrincipalId string
param tags object

// Use DNS-compatible alphanumeric tag names; the resource group retains the
// shared colon-prefixed convention.
var dnsTags = {
  acmeApplication: tags['acme:application']
  acmeEnvironment: tags['acme:environment']
  acmeManagedBy: tags['acme:managed-by']
  acmeOwner: tags['acme:owner']
  acmeProvisioner: tags['acme:provisioner']
  acmeCostCenter: tags['acme:cost-center']
  acmeLifecycle: tags['acme:lifecycle']
}

resource zone 'Microsoft.Network/dnsZones@2018-05-01' = {
  name: zoneName
  location: 'global'
  tags: dnsTags
  properties: {
    zoneType: 'Public'
  }
}

resource retentionLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: 'retain-public-dns'
  scope: zone
  properties: {
    level: 'CanNotDelete'
    notes: 'Retain delegation across workload pause and rebuild. Record updates remain allowed.'
  }
}

resource dnsWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(zone.id, deploymentPrincipalId, 'DNS Zone Contributor')
  scope: zone
  properties: {
    principalId: deploymentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'befefa01-2a29-4197-83a8-272ff33ce314')
  }
}

output zoneId string = zone.id
output nameServers array = zone.properties.nameServers
