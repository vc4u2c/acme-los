param name string
param location string
param tags object = {}
param managedEnvironmentId string
param workloadProfileName string = 'consumption'
param userAssignedIdentityResourceId string
param containerRegistryServer string
param containerImage string
param appEnvironmentName string
param appBuildId string
param bffVersion string = '0.0.0'
param oktaEnvironmentName string = appEnvironmentName
param oktaIssuer string
param oktaOrgUrl string = ''
param oktaClientId string
param oktaRedirectUri string
param oktaPostLogoutRedirectUri string
param oktaFundingAcrValues string = 'urn:okta:loa:2fa:any'
@allowed([
  'email'
  'sms'
  'email_or_sms'
])
param oktaFundingStepUpMethod string = 'email_or_sms'
param oktaFundingStepUpRequiresPassword bool = false
@allowed([
  ''
  'disabled'
  'sample'
])
param oktaCustomerIdWritebackMode string = ''
param oktaManagementClientId string = ''
param oktaManagementPrivateKeySecretName string = 'sec-acme-los-okta-management-private-key'
@secure()
param oktaManagementPrivateKeySecretKeyVaultUrl string = ''
param oktaManagementPrivateKeyId string = ''
param oktaManagementScopes string = 'okta.users.read okta.users.manage'
param oktaEmailLoginSyncEnabled bool = false
@allowed([
  'file'
  'redis'
])
param stateStoreMode string
param redisKeyPrefix string = ''
param redisHostName string = ''
param redisPort int = 10000
param redisManagedIdentityClientId string = ''
param applicationInsightsConnectionString string
param trustedProxySecretName string
@secure()
param trustedProxySecretKeyVaultUrl string
@allowed([
  ''
  'disabled'
  'entra'
])
param serviceAuthMode string = ''
param serviceAuthTenantId string = ''
param serviceAuthAudience string = ''
param serviceAuthAllowedClientIds string = ''
param serviceAuthAllowedObjectIds string = ''
param sessionSecretName string
@secure()
param sessionSecretKeyVaultUrl string
param targetPort int = 8080
param containerCpu string = '0.5'
param containerMemory string = '1Gi'
param minReplicas int = 0
param maxReplicas int = 1

var telemetryServiceName = 'acme-los-bff'
var telemetryTracesPerSecond = appEnvironmentName == 'prod' ? '5' : '2'
var telemetryResourceAttributes = 'service.namespace=acme-los,deployment.environment.name=${appEnvironmentName}'
var redisBaseEnvironmentVariables = stateStoreMode == 'redis'
  ? [
      {
        name: 'ACME_REDIS_AUTH_MODE'
        value: 'entra'
      }
      {
        name: 'ACME_REDIS_KEY_PREFIX'
        value: redisKeyPrefix
      }
    ]
  : []
var redisEntraEnvironmentVariables = stateStoreMode == 'redis'
  ? [
      {
        name: 'ACME_REDIS_HOST'
        value: redisHostName
      }
      {
        name: 'ACME_REDIS_PORT'
        value: string(redisPort)
      }
      {
        name: 'ACME_REDIS_MANAGED_IDENTITY_CLIENT_ID'
        value: redisManagedIdentityClientId
      }
      {
        name: 'AZURE_CLIENT_ID'
        value: redisManagedIdentityClientId
      }
    ]
  : []
var serviceAuthEnvironmentVariables = toLower(serviceAuthMode) == 'entra'
  ? [
      {
        name: 'ACME_BFF_SERVICE_AUTH_MODE'
        value: 'entra'
      }
      {
        name: 'ACME_BFF_SERVICE_AUTH_TENANT_ID'
        value: serviceAuthTenantId
      }
      {
        name: 'ACME_BFF_SERVICE_AUTH_AUDIENCE'
        value: serviceAuthAudience
      }
      {
        name: 'ACME_BFF_SERVICE_AUTH_ALLOWED_CLIENT_IDS'
        value: serviceAuthAllowedClientIds
      }
      {
        name: 'ACME_BFF_SERVICE_AUTH_ALLOWED_OBJECT_IDS'
        value: serviceAuthAllowedObjectIds
      }
    ]
  : []
var oktaCustomerIdWritebackEnabled = toLower(oktaCustomerIdWritebackMode) == 'sample'
var oktaManagementEnabled = oktaCustomerIdWritebackEnabled || oktaEmailLoginSyncEnabled
var oktaManagementEnvironmentVariables = oktaManagementEnabled
  ? [
      {
        name: 'ACME_OKTA_MANAGEMENT_CLIENT_ID'
        value: oktaManagementClientId
      }
      {
        name: 'ACME_OKTA_MANAGEMENT_PRIVATE_KEY_PEM'
        secretRef: oktaManagementPrivateKeySecretName
      }
      {
        name: 'ACME_OKTA_MANAGEMENT_PRIVATE_KEY_ID'
        value: oktaManagementPrivateKeyId
      }
      {
        name: 'ACME_OKTA_MANAGEMENT_SCOPES'
        value: oktaManagementScopes
      }
    ]
  : []
var oktaCustomerIdWritebackEnvironmentVariables = oktaCustomerIdWritebackEnabled
  ? [
      {
        name: 'ACME_OKTA_CUSTOMER_ID_WRITEBACK_MODE'
        value: 'sample'
      }
    ]
  : []
var oktaEmailLoginSyncEnvironmentVariables = oktaEmailLoginSyncEnabled
  ? [
      {
        name: 'ACME_OKTA_EMAIL_LOGIN_SYNC_ENABLED'
        value: 'true'
      }
    ]
  : []
var environmentVariables = concat(
  [
    {
      name: 'APP_BUILD_ID'
      value: appBuildId
    }
    {
      name: 'APP_ENVIRONMENT_NAME'
      value: appEnvironmentName
    }
    {
      name: 'ASPNETCORE_ENVIRONMENT'
      value: appEnvironmentName
    }
    {
      name: 'DOTNET_ENVIRONMENT'
      value: appEnvironmentName
    }
    {
      name: 'ASPNETCORE_URLS'
      value: 'http://+:${targetPort}'
    }
    {
      name: 'ACME_BFF_VERSION'
      value: bffVersion
    }
    {
      name: 'ACME_OKTA_ENVIRONMENT'
      value: oktaEnvironmentName
    }
    {
      name: 'ACME_OKTA_ISSUER'
      value: oktaIssuer
    }
    {
      name: 'ACME_OKTA_ORG_URL'
      value: oktaOrgUrl
    }
    {
      name: 'ACME_OKTA_CLIENT_ID'
      value: oktaClientId
    }
    {
      name: 'ACME_OKTA_REDIRECT_URI'
      value: oktaRedirectUri
    }
    {
      name: 'ACME_OKTA_POST_LOGOUT_REDIRECT_URI'
      value: oktaPostLogoutRedirectUri
    }
    {
      name: 'ACME_OKTA_FUNDING_ACR_VALUES'
      value: oktaFundingAcrValues
    }
    {
      name: 'ACME_OKTA_FUNDING_STEP_UP_METHOD'
      value: oktaFundingStepUpMethod
    }
    {
      name: 'ACME_OKTA_FUNDING_STEP_UP_REQUIRES_PASSWORD'
      value: oktaFundingStepUpRequiresPassword ? 'true' : 'false'
    }
    {
      name: 'ACME_WEB_STATE_STORE'
      value: stateStoreMode
    }
    {
      name: 'ACME_WEB_SESSION_SECRET'
      secretRef: sessionSecretName
    }
    {
      name: 'ACME_BFF_TRUSTED_PROXY_SECRET'
      secretRef: trustedProxySecretName
    }
    {
      name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
      value: applicationInsightsConnectionString
    }
    {
      name: 'OTEL_SERVICE_NAME'
      value: telemetryServiceName
    }
    {
      name: 'OTEL_RESOURCE_ATTRIBUTES'
      value: telemetryResourceAttributes
    }
    {
      name: 'OTEL_TRACES_SAMPLER'
      value: 'microsoft.rate_limited'
    }
    {
      name: 'OTEL_TRACES_SAMPLER_ARG'
      value: telemetryTracesPerSecond
    }
  ],
  redisBaseEnvironmentVariables,
  redisEntraEnvironmentVariables,
  serviceAuthEnvironmentVariables,
  oktaManagementEnvironmentVariables,
  oktaCustomerIdWritebackEnvironmentVariables,
  oktaEmailLoginSyncEnvironmentVariables
)

var oktaManagementSecrets = !empty(oktaManagementPrivateKeySecretKeyVaultUrl)
  ? [
      {
        name: oktaManagementPrivateKeySecretName
        keyVaultUrl: oktaManagementPrivateKeySecretKeyVaultUrl
        identity: userAssignedIdentityResourceId
      }
    ]
  : []
var secrets = concat(
  [
    {
      name: sessionSecretName
      keyVaultUrl: sessionSecretKeyVaultUrl
      identity: userAssignedIdentityResourceId
    }
    {
      name: trustedProxySecretName
      keyVaultUrl: trustedProxySecretKeyVaultUrl
      identity: userAssignedIdentityResourceId
    }
  ],
  oktaManagementSecrets
)

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentityResourceId}': {}
    }
  }
  properties: {
    environmentId: managedEnvironmentId
    workloadProfileName: workloadProfileName
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        allowInsecure: false
        targetPort: targetPort
        transport: 'auto'
      }
      registries: [
        {
          server: containerRegistryServer
          identity: userAssignedIdentityResourceId
        }
      ]
      secrets: secrets
    }
    template: {
      containers: [
        {
          name: 'bff'
          image: containerImage
          env: environmentVariables
          resources: {
            cpu: json(containerCpu)
            memory: containerMemory
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health/ready'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              failureThreshold: 8
              timeoutSeconds: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health/ready'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 15
              periodSeconds: 15
              failureThreshold: 4
              timeoutSeconds: 5
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health/live'
                port: targetPort
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 4
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output name string = containerApp.name
output id string = containerApp.id
output latestRevisionFqdn string = containerApp.properties.latestRevisionFqdn
