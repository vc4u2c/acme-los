param name string
param location string
param displayName string
param tags object = {}
param sourceResourceId string
param serializedData string
param category string = 'workbook'

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: name
  location: location
  kind: 'shared'
  tags: tags
  properties: {
    displayName: displayName
    sourceId: sourceResourceId
    category: category
    serializedData: serializedData
    version: 'Notebook/1.0'
  }
}

output name string = workbook.name
output id string = workbook.id
