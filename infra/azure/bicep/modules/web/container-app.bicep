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
param stateStoreMode string
param redisKeyPrefix string = ''
param applicationInsightsConnectionString string
param keyVaultUri string
param sessionSecretName string = 'web-session-secret'
@secure()
param sessionSecretKeyVaultUrl string
param targetPort int = 3000
param containerCpu string = '0.5'
param containerMemory string = '1Gi'
param minReplicas int = 0
param maxReplicas int = 1
param redisSecretName string = 'redis-url'
@secure()
param redisSecretKeyVaultUrl string = ''

var telemetryServiceName = 'acme-los-web'
var telemetryTracesPerSecond = appEnvironmentName == 'prod' ? '5' : '2'
var telemetryResourceAttributes = 'service.namespace=acme-los,deployment.environment.name=${appEnvironmentName}'
var environmentVariables = concat([
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
    name: 'ACME_WEB_STATE_STORE'
    value: stateStoreMode
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
], stateStoreMode == 'redis' ? [
  {
    name: 'ACME_REDIS_KEY_PREFIX'
    value: redisKeyPrefix
  }
  {
    name: 'ACME_REDIS_URL'
    secretRef: redisSecretName
  }
] : [])

var secrets = concat([
  {
    name: sessionSecretName
    keyVaultUrl: sessionSecretKeyVaultUrl
    identity: userAssignedIdentityResourceId
  }
], stateStoreMode == 'redis' ? [
  {
    name: redisSecretName
    keyVaultUrl: redisSecretKeyVaultUrl
    identity: userAssignedIdentityResourceId
  }
] : [])

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
                path: '/api/health'
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
                path: '/api/health'
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
                path: '/api/health'
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
