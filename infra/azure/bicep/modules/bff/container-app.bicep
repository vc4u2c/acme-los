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
  redisEntraEnvironmentVariables
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
      secrets: [
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
      ]
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
