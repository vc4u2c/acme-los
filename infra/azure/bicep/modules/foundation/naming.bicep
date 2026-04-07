param organizationShortName string
param workloadShortName string
param environmentName string
param regionShortName string
param instanceNumber string = '01'
param uniqueShortSuffix string = 'v42c'

var suffix = toLower(uniqueShortSuffix)
var rgBase = 'rg-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}'
var stackBase = 'stk-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}'

output resourceGroupName string = toLower(rgBase)
output deploymentStackName string = toLower(stackBase)
output imagesResourceGroupName string = toLower('rg-${organizationShortName}-${workloadShortName}-images-${environmentName}-${regionShortName}-${instanceNumber}')
output imagesDeploymentStackName string = toLower('stk-${organizationShortName}-${workloadShortName}-images-${environmentName}-${regionShortName}-${instanceNumber}')
output appServicePlanName string = toLower('asp-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
output webAppName string = toLower('app-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}-${suffix}')
output containerAppEnvironmentName string = toLower('cae-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
output containerAppName string = toLower('ca-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
output userAssignedIdentityName string = toLower('id-${organizationShortName}-${workloadShortName}-web-${environmentName}-${regionShortName}-${instanceNumber}')
output keyVaultName string = toLower('kv${organizationShortName}${workloadShortName}${environmentName}${regionShortName}${instanceNumber}${suffix}')
output redisEnterpriseName string = toLower('redis-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
output logAnalyticsWorkspaceName string = toLower('log-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
output applicationInsightsName string = toLower('appi-${organizationShortName}-${workloadShortName}-${environmentName}-${regionShortName}-${instanceNumber}')
output containerRegistryName string = toLower('acr${organizationShortName}${workloadShortName}${environmentName}${regionShortName}${instanceNumber}${suffix}')
output hubEdgeResourceGroupName string = toLower('rg-${organizationShortName}-hub-edge-${regionShortName}-${instanceNumber}')
output hubMonitorResourceGroupName string = toLower('rg-${organizationShortName}-hub-monitor-${regionShortName}-${instanceNumber}')
output hubNetworkResourceGroupName string = toLower('rg-${organizationShortName}-hub-network-${regionShortName}-${instanceNumber}')
