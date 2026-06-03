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
param authProvider string = 'okta'
param oktaEnvironmentName string = appEnvironmentName
param oktaIssuer string
param oktaClientId string
param oktaRedirectUri string
param oktaPostLogoutRedirectUri string
param oktaFundingAcrValues string = 'urn:okta:loa:2fa:any'
param themeCookieDomain string = ''
param customDomains array = []
param analyticsEnabled bool = false
param analyticsEnvironmentName string = appEnvironmentName
param gtmContainerId string = ''
param ga4MeasurementId string = ''
param analyticsConsentDefaultAnalyticsStorage string = 'denied'
param analyticsConsentDefaultAdStorage string = 'denied'
param analyticsConsentDefaultAdUserData string = 'denied'
param analyticsConsentDefaultAdPersonalization string = 'denied'
param ga4MeasurementProtocolSecretName string = 'sec-acme-los-ga4-measurement-secret'
param smsMfaEnabled bool = false
param communicationServicesEndpoint string = ''
param smsSenderPhoneNumber string = ''
param oktaTelephonyHookAuthorizationSecretName string = 'sec-acme-los-okta-telephony-hook-authorization'
@secure()
param oktaTelephonyHookAuthorizationSecretKeyVaultUrl string = ''
param azureManagedIdentityClientId string = ''
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
param keyVaultUri string
param sessionSecretName string = 'web-session-secret'
@secure()
param sessionSecretKeyVaultUrl string
param bffBaseUrl string = ''
param bffTrustedProxySecretName string = 'sec-acme-los-bff-trusted-proxy-secret'
@secure()
param bffTrustedProxySecretKeyVaultUrl string = ''
@allowed([
  ''
  'disabled'
  'entra'
])
param bffServiceAuthMode string = ''
param bffServiceAuthTokenScope string = ''
param bffServiceAuthManagedIdentityClientId string = ''
param targetPort int = 3000
param containerCpu string = '0.5'
param containerMemory string = '1Gi'
param minReplicas int = 0
param maxReplicas int = 1
@minValue(1)
param sessionIdleTimeoutSeconds int = appEnvironmentName == 'dev' ? 120 : 900
@minValue(0)
param sessionWarningSeconds int = appEnvironmentName == 'dev' ? 30 : 120

var telemetryServiceName = 'acme-los-web'
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
    ]
  : []
var azureManagedIdentityEnvironmentVariables = !empty(azureManagedIdentityClientId)
  ? [
      {
        name: 'AZURE_CLIENT_ID'
        value: azureManagedIdentityClientId
      }
    ]
  : []
var smsMfaEnvironmentVariables = smsMfaEnabled
  ? [
      {
        name: 'ACME_ACS_ENDPOINT'
        value: communicationServicesEndpoint
      }
      {
        name: 'ACME_ACS_SMS_SENDER_PHONE_NUMBER'
        value: smsSenderPhoneNumber
      }
      {
        name: 'ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION'
        secretRef: oktaTelephonyHookAuthorizationSecretName
      }
    ]
  : []
var bffBaseEnvironmentVariables = !empty(bffBaseUrl)
  ? [
      {
        name: 'ACME_BFF_BASE_URL'
        value: bffBaseUrl
      }
      {
        name: 'ACME_BFF_PROXY_MODE'
        value: 'bff'
      }
    ]
  : []
var bffTrustedProxyEnvironmentVariables = !empty(bffTrustedProxySecretKeyVaultUrl)
  ? [
      {
        name: 'ACME_BFF_TRUSTED_PROXY_SECRET'
        secretRef: bffTrustedProxySecretName
      }
    ]
  : []
var bffServiceAuthEnvironmentVariables = toLower(bffServiceAuthMode) == 'entra'
  ? [
      {
        name: 'ACME_BFF_SERVICE_AUTH_MODE'
        value: 'entra'
      }
      {
        name: 'ACME_BFF_SERVICE_AUTH_SCOPE'
        value: bffServiceAuthTokenScope
      }
      {
        name: 'ACME_BFF_SERVICE_AUTH_MANAGED_IDENTITY_CLIENT_ID'
        value: bffServiceAuthManagedIdentityClientId
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
      name: 'NEXT_PUBLIC_APP_ENVIRONMENT'
      value: appEnvironmentName
    }
    {
      name: 'ACME_AUTH_PROVIDER'
      value: authProvider
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
      name: 'NEXT_PUBLIC_AUTH_PROVIDER'
      value: authProvider
    }
    {
      name: 'NEXT_PUBLIC_OKTA_ENVIRONMENT'
      value: oktaEnvironmentName
    }
    {
      name: 'NEXT_PUBLIC_OKTA_ISSUER'
      value: oktaIssuer
    }
    {
      name: 'NEXT_PUBLIC_OKTA_CLIENT_ID'
      value: oktaClientId
    }
    {
      name: 'NEXT_PUBLIC_OKTA_REDIRECT_URI'
      value: oktaRedirectUri
    }
    {
      name: 'NEXT_PUBLIC_OKTA_POST_LOGOUT_REDIRECT_URI'
      value: oktaPostLogoutRedirectUri
    }
    {
      name: 'NEXT_PUBLIC_OKTA_FUNDING_ACR_VALUES'
      value: oktaFundingAcrValues
    }
    {
      name: 'NEXT_PUBLIC_ACME_THEME_COOKIE_DOMAIN'
      value: themeCookieDomain
    }
    {
      name: 'NEXT_PUBLIC_ACME_ANALYTICS_ENABLED'
      value: analyticsEnabled ? 'true' : 'false'
    }
    {
      name: 'NEXT_PUBLIC_ACME_ANALYTICS_ENVIRONMENT'
      value: analyticsEnvironmentName
    }
    {
      name: 'NEXT_PUBLIC_ACME_GTM_CONTAINER_ID'
      value: gtmContainerId
    }
    {
      name: 'NEXT_PUBLIC_ACME_GA4_MEASUREMENT_ID'
      value: ga4MeasurementId
    }
    {
      name: 'NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE'
      value: analyticsConsentDefaultAnalyticsStorage
    }
    {
      name: 'NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE'
      value: analyticsConsentDefaultAdStorage
    }
    {
      name: 'NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA'
      value: analyticsConsentDefaultAdUserData
    }
    {
      name: 'NEXT_PUBLIC_ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION'
      value: analyticsConsentDefaultAdPersonalization
    }
    {
      name: 'ACME_GA4_MEASUREMENT_ID'
      value: ga4MeasurementId
    }
    {
      name: 'ACME_GA4_MEASUREMENT_PROTOCOL_SECRET_NAME'
      value: ga4MeasurementProtocolSecretName
    }
    {
      name: 'ACME_ANALYTICS_CONSENT_DEFAULT_ANALYTICS_STORAGE'
      value: analyticsConsentDefaultAnalyticsStorage
    }
    {
      name: 'ACME_ANALYTICS_CONSENT_DEFAULT_AD_STORAGE'
      value: analyticsConsentDefaultAdStorage
    }
    {
      name: 'ACME_ANALYTICS_CONSENT_DEFAULT_AD_USER_DATA'
      value: analyticsConsentDefaultAdUserData
    }
    {
      name: 'ACME_ANALYTICS_CONSENT_DEFAULT_AD_PERSONALIZATION'
      value: analyticsConsentDefaultAdPersonalization
    }
    {
      name: 'ACME_WEB_STATE_STORE'
      value: stateStoreMode
    }
    {
      name: 'ACME_WEB_SESSION_IDLE_TIMEOUT_SECONDS'
      value: string(sessionIdleTimeoutSeconds)
    }
    {
      name: 'ACME_WEB_SESSION_WARNING_SECONDS'
      value: string(sessionWarningSeconds)
    }
    {
      name: 'NEXT_TELEMETRY_DISABLED'
      value: '1'
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
    {
      name: 'KEY_VAULT_URI'
      value: keyVaultUri
    }
    {
      name: 'ACME_WEB_SESSION_SECRET'
      secretRef: sessionSecretName
    }
  ],
  redisBaseEnvironmentVariables,
  redisEntraEnvironmentVariables,
  azureManagedIdentityEnvironmentVariables,
  smsMfaEnvironmentVariables,
  bffBaseEnvironmentVariables,
  bffTrustedProxyEnvironmentVariables,
  bffServiceAuthEnvironmentVariables
)

var sessionSecrets = [
  {
    name: sessionSecretName
    keyVaultUrl: sessionSecretKeyVaultUrl
    identity: userAssignedIdentityResourceId
  }
]
var bffSecrets = !empty(bffTrustedProxySecretKeyVaultUrl)
  ? [
      {
        name: bffTrustedProxySecretName
        keyVaultUrl: bffTrustedProxySecretKeyVaultUrl
        identity: userAssignedIdentityResourceId
      }
    ]
  : []
var smsMfaSecrets = !empty(oktaTelephonyHookAuthorizationSecretKeyVaultUrl)
  ? [
      {
        name: oktaTelephonyHookAuthorizationSecretName
        keyVaultUrl: oktaTelephonyHookAuthorizationSecretKeyVaultUrl
        identity: userAssignedIdentityResourceId
      }
    ]
  : []
var secrets = concat(sessionSecrets, bffSecrets, smsMfaSecrets)

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
        external: true
        allowInsecure: false
        targetPort: targetPort
        transport: 'auto'
        customDomains: customDomains
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
          name: 'web'
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
                path: '/api/health/live'
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
                path: '/api/health/live'
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
                path: '/api/health/live'
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
