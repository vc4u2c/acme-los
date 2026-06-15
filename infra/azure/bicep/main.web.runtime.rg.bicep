targetScope = 'resourceGroup'

@allowed([
  'dev'
  'qa'
  'stg'
  'prod'
])
param environmentName string

param location string = resourceGroup().location
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param regionShortName string = 'cus'
param instanceNumber string = '01'
param ownerTag string = 'vc4u2c'
param costCenterTag string = 'playg'
param extraTags object = {}
@allowed([
  'file'
  'redis'
])
param stateStoreMode string = 'file'
param managedEnvironmentId string
param userAssignedIdentityResourceId string
param userAssignedIdentityClientId string = ''
param appBuildId string
param authProvider string = 'okta'
param oktaEnvironmentName string = environmentName
param oktaIssuer string
param oktaOrgUrl string = ''
param oktaClientId string
param oktaRedirectUri string
param oktaPostLogoutRedirectUri string
param oktaFundingAcrValues string = 'urn:okta:loa:2fa:any'
@allowed([
  'email'
  'sms'
])
param oktaFundingStepUpMethod string = 'email'
param themeCookieDomain string = ''
param customDomainEnabled bool = false
param customDomainHostname string = ''
@allowed([
  'CNAME'
])
param customDomainValidationMethod string = 'CNAME'
param analyticsEnabled bool = false
param analyticsEnvironmentName string = environmentName
param gtmContainerId string = ''
param ga4MeasurementId string = ''
param analyticsConsentDefaultAnalyticsStorage string = 'denied'
param analyticsConsentDefaultAdStorage string = 'denied'
param analyticsConsentDefaultAdUserData string = 'denied'
param analyticsConsentDefaultAdPersonalization string = 'denied'
param ga4MeasurementProtocolSecretName string = 'sec-acme-los-ga4-measurement-secret'
param smsMfaEnabled bool = false
@allowed([
  'acs'
  'mock'
])
param smsMfaProvider string = 'acs'
param mockSmsOtpEnabled bool = false
param communicationServicesEndpoint string = ''
param smsSenderPhoneNumber string = ''
param oktaTelephonyHookAuthorizationSecretName string = 'sec-acme-los-okta-telephony-hook-authorization'
@secure()
param oktaTelephonyHookAuthorizationSecretValue string = ''
@allowed([
  ''
  'disabled'
  'sample'
])
param oktaCustomerIdWritebackMode string = ''
param oktaManagementClientId string = ''
param oktaManagementPrivateKeySecretName string = 'sec-acme-los-okta-management-private-key'
@secure()
param oktaManagementPrivateKeySecretValue string = ''
param oktaManagementPrivateKeyId string = ''
param oktaManagementScopes string = 'okta.users.manage'
param containerRegistryLoginServer string
param containerImage string
param bffContainerImage string = ''
param bffBaseUrl string = ''
param bffVersion string = '0.0.0'
param bffTrustedProxySecretName string = 'sec-acme-los-bff-trusted-proxy-secret'
@secure()
param bffTrustedProxySecretValue string = ''
@allowed([
  ''
  'disabled'
  'entra'
])
param bffServiceAuthMode string = ''
param bffServiceAuthTenantId string = ''
param bffServiceAuthAudience string = ''
param bffServiceAuthTokenScope string = ''
param bffServiceAuthAllowedClientIds string = ''
param bffServiceAuthAllowedObjectIds string = ''
param applicationInsightsConnectionString string
param logAnalyticsWorkspaceId string
param keyVaultName string
param keyVaultUri string
param sessionSecretName string = 'sec-acme-los-web-session-secret'
@secure()
param sessionSecretValue string
param redisHostName string = ''
param redisPort int = 0
param containerTargetPort int = 3000
param containerCpu string = '0.5'
param containerMemory string = '1Gi'
param bffContainerTargetPort int = 8080
param bffContainerCpu string = '0.5'
param bffContainerMemory string = '1Gi'
param minReplicas int = 0
param maxReplicas int = 1
param bffMinReplicas int = 0
param bffMaxReplicas int = 1
param workloadProfileName string = 'consumption'
@minValue(1)
param sessionIdleTimeoutSeconds int = environmentName == 'dev' ? 120 : 900
@minValue(0)
param sessionWarningSeconds int = environmentName == 'dev' ? 30 : 120

var resolvedContainerAppName = toLower('ca-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
var deployBff = !empty(bffContainerImage)
var resolvedBffContainerAppName = toLower('ca-${organizationShortName}-${workloadShortName}-bff-${environmentName}-${regionShortName}-${instanceNumber}')
var oktaCustomerIdWritebackEnabled = toLower(oktaCustomerIdWritebackMode) == 'sample'
var redisKeyPrefix = '${organizationShortName}-${workloadShortName}:web:${environmentName}'
var bffRedisKeyPrefix = '${organizationShortName}-${workloadShortName}:bff:${environmentName}'
var resolvedContainerAppDiagnosticSettingsName = toLower('diag-${organizationShortName}-${workloadShortName}-ca-${environmentName}-${regionShortName}-${instanceNumber}')
var resolvedBffContainerAppDiagnosticSettingsName = toLower('diag-${organizationShortName}-${workloadShortName}-bff-ca-${environmentName}-${regionShortName}-${instanceNumber}')
var customDomainCertificateName = toLower('mcert-${organizationShortName}-${workloadShortName}-${environmentName}-${replace(customDomainHostname, '.', '-')}')

resource managedEnvironmentResource 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: last(split(managedEnvironmentId, '/'))
}

resource customDomainCertificate 'Microsoft.App/managedEnvironments/managedCertificates@2025-01-01' = if (customDomainEnabled) {
  parent: managedEnvironmentResource
  name: customDomainCertificateName
  location: location
  properties: {
    subjectName: customDomainHostname
    domainControlValidation: customDomainValidationMethod
  }
}

resource keyVaultResource 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource sessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVaultResource
  name: sessionSecretName
  properties: {
    value: sessionSecretValue
  }
}

resource bffTrustedProxySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (deployBff) {
  parent: keyVaultResource
  name: bffTrustedProxySecretName
  properties: {
    value: bffTrustedProxySecretValue
  }
}

resource oktaTelephonyHookAuthorizationSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (smsMfaEnabled) {
  parent: keyVaultResource
  name: oktaTelephonyHookAuthorizationSecretName
  properties: {
    value: oktaTelephonyHookAuthorizationSecretValue
  }
}

resource oktaManagementPrivateKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (oktaCustomerIdWritebackEnabled && !empty(oktaManagementPrivateKeySecretValue)) {
  parent: keyVaultResource
  name: oktaManagementPrivateKeySecretName
  properties: {
    value: oktaManagementPrivateKeySecretValue
  }
}

module tags './modules/foundation/tags.bicep' = {
  name: 'runtime-tags-${environmentName}'
  params: {
    environmentName: environmentName
    applicationName: '${organizationShortName}-${workloadShortName}'
    owner: ownerTag
    costCenter: costCenterTag
    extraTags: extraTags
  }
}

module containerApp './modules/web/container-app.bicep' = {
  name: 'ca-${environmentName}'
  params: {
    name: resolvedContainerAppName
    location: location
    tags: tags.outputs.tags
    managedEnvironmentId: managedEnvironmentId
    workloadProfileName: workloadProfileName
    userAssignedIdentityResourceId: userAssignedIdentityResourceId
    containerRegistryServer: containerRegistryLoginServer
    containerImage: containerImage
    appEnvironmentName: environmentName
    appBuildId: appBuildId
    authProvider: authProvider
    oktaEnvironmentName: oktaEnvironmentName
    oktaIssuer: oktaIssuer
    oktaOrgUrl: oktaOrgUrl
    oktaClientId: oktaClientId
    oktaRedirectUri: oktaRedirectUri
    oktaPostLogoutRedirectUri: oktaPostLogoutRedirectUri
    oktaFundingAcrValues: oktaFundingAcrValues
    oktaFundingStepUpMethod: oktaFundingStepUpMethod
    themeCookieDomain: themeCookieDomain
    customDomains: customDomainEnabled
      ? [
          {
            name: customDomainHostname
            bindingType: 'SniEnabled'
            certificateId: customDomainCertificate!.id
          }
        ]
      : []
    analyticsEnabled: analyticsEnabled
    analyticsEnvironmentName: analyticsEnvironmentName
    gtmContainerId: gtmContainerId
    ga4MeasurementId: ga4MeasurementId
    analyticsConsentDefaultAnalyticsStorage: analyticsConsentDefaultAnalyticsStorage
    analyticsConsentDefaultAdStorage: analyticsConsentDefaultAdStorage
    analyticsConsentDefaultAdUserData: analyticsConsentDefaultAdUserData
    analyticsConsentDefaultAdPersonalization: analyticsConsentDefaultAdPersonalization
    ga4MeasurementProtocolSecretName: ga4MeasurementProtocolSecretName
    smsMfaEnabled: smsMfaEnabled
    smsMfaProvider: smsMfaProvider
    mockSmsOtpEnabled: mockSmsOtpEnabled
    communicationServicesEndpoint: communicationServicesEndpoint
    smsSenderPhoneNumber: smsSenderPhoneNumber
    oktaTelephonyHookAuthorizationSecretName: oktaTelephonyHookAuthorizationSecretName
    oktaTelephonyHookAuthorizationSecretKeyVaultUrl: smsMfaEnabled
      ? '${keyVaultUri}secrets/${oktaTelephonyHookAuthorizationSecretName}'
      : ''
    azureManagedIdentityClientId: userAssignedIdentityClientId
    stateStoreMode: stateStoreMode
    redisKeyPrefix: redisKeyPrefix
    redisHostName: redisHostName
    redisPort: redisPort
    redisManagedIdentityClientId: userAssignedIdentityClientId
    applicationInsightsConnectionString: applicationInsightsConnectionString
    keyVaultUri: keyVaultUri
    sessionSecretName: sessionSecretName
    sessionSecretKeyVaultUrl: '${keyVaultUri}secrets/${sessionSecretName}'
    bffBaseUrl: deployBff ? bffBaseUrl : ''
    bffTrustedProxySecretName: bffTrustedProxySecretName
    bffTrustedProxySecretKeyVaultUrl: deployBff ? '${keyVaultUri}secrets/${bffTrustedProxySecretName}' : ''
    bffServiceAuthMode: deployBff ? bffServiceAuthMode : ''
    bffServiceAuthTokenScope: deployBff ? bffServiceAuthTokenScope : ''
    bffServiceAuthManagedIdentityClientId: deployBff ? userAssignedIdentityClientId : ''
    targetPort: containerTargetPort
    containerCpu: containerCpu
    containerMemory: containerMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    sessionIdleTimeoutSeconds: sessionIdleTimeoutSeconds
    sessionWarningSeconds: sessionWarningSeconds
  }
  dependsOn: [
    sessionSecret
    bffTrustedProxySecret
    oktaTelephonyHookAuthorizationSecret
  ]
}

module bffContainerApp './modules/bff/container-app.bicep' = if (deployBff) {
  name: 'ca-bff-${environmentName}'
  params: {
    name: resolvedBffContainerAppName
    location: location
    tags: tags.outputs.tags
    managedEnvironmentId: managedEnvironmentId
    workloadProfileName: workloadProfileName
    userAssignedIdentityResourceId: userAssignedIdentityResourceId
    containerRegistryServer: containerRegistryLoginServer
    containerImage: bffContainerImage
    appEnvironmentName: environmentName
    appBuildId: appBuildId
    bffVersion: bffVersion
    authProvider: authProvider
    oktaEnvironmentName: oktaEnvironmentName
    oktaIssuer: oktaIssuer
    oktaClientId: oktaClientId
    oktaRedirectUri: oktaRedirectUri
    oktaPostLogoutRedirectUri: oktaPostLogoutRedirectUri
    oktaFundingAcrValues: oktaFundingAcrValues
    oktaFundingStepUpMethod: oktaFundingStepUpMethod
    oktaCustomerIdWritebackMode: oktaCustomerIdWritebackMode
    oktaManagementClientId: oktaManagementClientId
    oktaManagementPrivateKeySecretName: oktaManagementPrivateKeySecretName
    oktaManagementPrivateKeySecretKeyVaultUrl: oktaCustomerIdWritebackEnabled
      ? '${keyVaultUri}secrets/${oktaManagementPrivateKeySecretName}'
      : ''
    oktaManagementPrivateKeyId: oktaManagementPrivateKeyId
    oktaManagementScopes: oktaManagementScopes
    stateStoreMode: stateStoreMode
    redisKeyPrefix: bffRedisKeyPrefix
    redisHostName: redisHostName
    redisPort: redisPort
    redisManagedIdentityClientId: userAssignedIdentityClientId
    applicationInsightsConnectionString: applicationInsightsConnectionString
    sessionSecretName: sessionSecretName
    sessionSecretKeyVaultUrl: '${keyVaultUri}secrets/${sessionSecretName}'
    trustedProxySecretName: bffTrustedProxySecretName
    trustedProxySecretKeyVaultUrl: '${keyVaultUri}secrets/${bffTrustedProxySecretName}'
    serviceAuthMode: bffServiceAuthMode
    serviceAuthTenantId: bffServiceAuthTenantId
    serviceAuthAudience: bffServiceAuthAudience
    serviceAuthAllowedClientIds: bffServiceAuthAllowedClientIds
    serviceAuthAllowedObjectIds: bffServiceAuthAllowedObjectIds
    targetPort: bffContainerTargetPort
    containerCpu: bffContainerCpu
    containerMemory: bffContainerMemory
    minReplicas: bffMinReplicas
    maxReplicas: bffMaxReplicas
  }
  dependsOn: [
    sessionSecret
    bffTrustedProxySecret
    oktaManagementPrivateKeySecret
  ]
}

resource containerAppResource 'Microsoft.App/containerApps@2025-01-01' existing = {
  name: resolvedContainerAppName
}

resource bffContainerAppResource 'Microsoft.App/containerApps@2025-01-01' existing = if (deployBff) {
  name: resolvedBffContainerAppName
}

resource containerAppDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: resolvedContainerAppDiagnosticSettingsName
  scope: containerAppResource
  dependsOn: [
    containerApp
  ]
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource bffContainerAppDiagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (deployBff) {
  name: resolvedBffContainerAppDiagnosticSettingsName
  scope: bffContainerAppResource
  dependsOn: [
    bffContainerApp
  ]
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output containerAppName string = containerApp.outputs.name
output containerAppId string = containerApp.outputs.id
output containerAppLatestRevisionFqdn string = containerApp.outputs.latestRevisionFqdn
output bffEnabled bool = deployBff
output bffContainerAppName string = deployBff ? bffContainerApp!.outputs.name : ''
output bffContainerAppId string = deployBff ? bffContainerApp!.outputs.id : ''
output bffContainerAppLatestRevisionFqdn string = deployBff ? bffContainerApp!.outputs.latestRevisionFqdn : ''
output bffContainerAppBaseUrl string = deployBff ? bffBaseUrl : ''
output redisAuthMode string = stateStoreMode == 'redis' ? 'entra' : ''
