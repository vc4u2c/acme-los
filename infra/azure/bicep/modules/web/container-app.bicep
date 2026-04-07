param name string
param location string
param tags object = {}
param managedEnvironmentId string
param workloadProfileName string = 'consumption'
param userAssignedIdentityResourceId string
param containerRegistryServer string
param containerImage string
param appEnvironmentName string
param stateStoreMode string
param redisKeyPrefix string = ''
param applicationInsightsConnectionString string
param keyVaultUri string
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
    name: 'APP_ENVIRONMENT_NAME'
    value: appEnvironmentName
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

var secrets = stateStoreMode == 'redis' ? [
  {
    name: redisSecretName
    keyVaultUrl: redisSecretKeyVaultUrl
    identity: userAssignedIdentityResourceId
  }
] : []

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
