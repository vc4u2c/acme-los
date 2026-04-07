param name string
param location string
param tags object = {}
param workspaceResourceId string

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: name
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspaceResourceId
    IngestionMode: 'LogAnalytics'
  }
}

output name string = insights.name
output id string = insights.id
output connectionString string = insights.properties.ConnectionString
