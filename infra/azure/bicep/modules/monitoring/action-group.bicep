param name string
param tags object = {}
param groupShortName string
param enabled bool = true
param emailReceivers array = []

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: name
  location: 'global'
  tags: tags
  properties: {
    enabled: enabled
    groupShortName: groupShortName
    emailReceivers: emailReceivers
    armRoleReceivers: []
    automationRunbookReceivers: []
    azureAppPushReceivers: []
    azureFunctionReceivers: []
    eventHubReceivers: []
    itsmReceivers: []
    logicAppReceivers: []
    smsReceivers: []
    voiceReceivers: []
    webhookReceivers: []
  }
}

output name string = actionGroup.name
output id string = actionGroup.id
