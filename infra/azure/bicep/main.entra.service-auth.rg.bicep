extension microsoftGraphV1

@allowed([
  'dev'
  'qa'
  'stg'
  'prod'
])
param environmentName string

param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param bffApiIdentifierUri string = 'api://${organizationShortName}-${workloadShortName}-bff-${environmentName}'
param bffAccessAppRoleId string = guid('acme-los-bff-service-auth', environmentName)
param webManagedIdentityClientId string
param webManagedIdentityPrincipalId string

var normalizedOrganizationName = toUpper(organizationShortName)
var normalizedWorkloadName = toUpper(workloadShortName)
var bffApiDisplayName = '${normalizedOrganizationName} ${normalizedWorkloadName} BFF API ${environmentName}'
var bffApiUniqueName = '${organizationShortName}-${workloadShortName}-bff-api-${environmentName}'
var bffAccessAppRoleValue = 'Bff.Access'
var resourceTags = [
  'acme-los'
  'environment:${environmentName}'
  'managed-by:bicep'
  'purpose:bff-service-auth'
]

resource bffApiApplication 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: bffApiUniqueName
  displayName: bffApiDisplayName
  description: 'Internal API audience for ACME LOS Next-to-BFF managed identity service authentication.'
  identifierUris: [
    bffApiIdentifierUri
  ]
  signInAudience: 'AzureADMyOrg'
  api: {
    requestedAccessTokenVersion: 2
  }
  appRoles: [
    {
      allowedMemberTypes: [
        'Application'
      ]
      description: 'Allows the ACME LOS web tier managed identity to call the internal BFF API.'
      displayName: 'Call BFF API'
      id: bffAccessAppRoleId
      isEnabled: true
      value: bffAccessAppRoleValue
    }
  ]
  tags: resourceTags
}

resource bffApiServicePrincipal 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: bffApiApplication.appId
  appRoleAssignmentRequired: true
  description: 'Enterprise application for ACME LOS internal BFF service authentication.'
  displayName: bffApiDisplayName
  tags: resourceTags
}

resource webManagedIdentityServicePrincipal 'Microsoft.Graph/servicePrincipals@v1.0' existing = {
  appId: webManagedIdentityClientId
}

resource webManagedIdentityBffAccess 'Microsoft.Graph/appRoleAssignedTo@v1.0' = {
  appRoleId: bffAccessAppRoleId
  principalId: webManagedIdentityServicePrincipal.id
  resourceDisplayName: bffApiServicePrincipal.displayName
  resourceId: bffApiServicePrincipal.id
}

output bffServiceAuthAudience string = bffApiIdentifierUri
output bffServiceAuthTokenScope string = '${bffApiIdentifierUri}/.default'
output bffAccessAppRoleId string = bffAccessAppRoleId
output bffApiApplicationClientId string = bffApiApplication.appId
output bffApiApplicationObjectId string = bffApiApplication.id
output bffApiServicePrincipalId string = bffApiServicePrincipal.id
output webManagedIdentityClientId string = webManagedIdentityClientId
output webManagedIdentityPrincipalId string = webManagedIdentityPrincipalId
