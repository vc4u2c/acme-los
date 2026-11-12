targetScope = 'resourceGroup'

param environmentName string
param location string = resourceGroup().location
param organizationShortName string = 'acme'
param workloadShortName string = 'los'
param managedEnvironmentName string
@minLength(1)
param hostname string

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: managedEnvironmentName
}

resource certificate 'Microsoft.App/managedEnvironments/managedCertificates@2025-01-01' = {
  parent: managedEnvironment
  name: toLower('mcert-${organizationShortName}-${workloadShortName}-${environmentName}-${replace(hostname, '.', '-')}')
  location: location
  properties: {
    subjectName: hostname
    domainControlValidation: 'CNAME'
  }
}

output certificateId string = certificate.id
