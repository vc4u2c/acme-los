param environmentName string
param applicationName string
param owner string = 'acme'
param costCenter string = 'playg'
param provisioner string = 'github-actions'
param extraTags object = {}

output tags object = union(
  {
    'acme:application': applicationName
    'acme:environment': environmentName
    'acme:managed-by': 'bicep'
    'acme:owner': owner
    'acme:provisioner': provisioner
    'acme:cost-center': costCenter
  },
  extraTags
)
