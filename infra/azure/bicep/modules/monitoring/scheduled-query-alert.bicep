param name string
param location string
param tags object = {}
param description string
param displayName string
param workspaceResourceId string
param targetResourceType string = 'microsoft.operationalinsights/workspaces'
param query string
param threshold int
param operator string = 'GreaterThan'
param severity int = 3
param windowSize string = 'PT10M'
param evaluationFrequency string = 'PT5M'
param failingPeriods int = 1
param numberOfEvaluationPeriods int = 1
param metricMeasureColumn string = 'AlertValue'
param enabled bool = true
param actionGroupIds array = []
param customProperties object = {}

resource alert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: name
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: displayName
    description: description
    enabled: enabled
    evaluationFrequency: evaluationFrequency
    windowSize: windowSize
    severity: severity
    scopes: [
      workspaceResourceId
    ]
    targetResourceTypes: [
      targetResourceType
    ]
    criteria: {
      allOf: [
        {
          query: query
          timeAggregation: 'Total'
          operator: operator
          threshold: threshold
          metricMeasureColumn: metricMeasureColumn
          failingPeriods: {
            minFailingPeriodsToAlert: failingPeriods
            numberOfEvaluationPeriods: numberOfEvaluationPeriods
          }
        }
      ]
    }
    actions: {
      actionGroups: actionGroupIds
      customProperties: customProperties
    }
    skipQueryValidation: false
  }
}

output name string = alert.name
output id string = alert.id
