param vaultName string
param secretName string
@secure()
param secretValue string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: vaultName
}

resource secret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: secretName
  properties: {
    value: secretValue
  }
}

output secretId string = secret.id
