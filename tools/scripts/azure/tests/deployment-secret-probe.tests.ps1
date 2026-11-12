Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../private-connectivity.ps1')
$source = Join-Path $PSScriptRoot '../deploy-web-environment.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$null, [ref]$null)
foreach ($name in @('Invoke-AzJson', 'Test-KeyVaultSecretExists')) {
  $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  . ([scriptblock]::Create($definition.Extent.Text))
}
$script:probeResponse = ''; $script:probeError = ''
function az {
  $global:LASTEXITCODE = 0
  if ($script:probeError) {
    $global:LASTEXITCODE = 1
    Write-Error $script:probeError
    return
  }
  return $script:probeResponse
}
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Test-Secret { Test-KeyVaultSecretExists 'synthetic-subscription' 'synthetic-group' 'synthetic-vault' 'synthetic-secret' }
try {
  $script:probeResponse = '{"id":"synthetic-secret","properties":{}}'
  Assert-True (Test-Secret) 'Existing secret must be reused.'
  foreach ($code in @('ResourceNotFound', 'ParentResourceNotFound')) {
    foreach ($style in @('rest', 'cli')) {
      $script:probeError = if ($style -eq 'rest') { 'ERROR: Not Found({"error":{"code":"' + $code + '","message":"Synthetic absent secret"}})' } else { "ERROR: ($code) Synthetic absent secret" }
      Assert-True (-not (Test-Secret)) "$style $code must allow first-time secret creation."
    }
  }
  foreach ($errorText in @(
    'ERROR: Forbidden({"error":{"code":"AuthorizationFailed","message":"Synthetic denied access"}})',
    'ERROR: Forbidden({"error":{"code":"Forbidden","message":"ResourceNotFound is not a permission"}})',
    'ERROR: Not Found({"error":{"code":"Unknown","message":"Synthetic absent response"}})',
    'ERROR: (TooManyRequests) Synthetic rate limit',
    'ERROR: Synthetic network failure'
  )) {
    $script:probeError = $errorText
    $caught = $null
    try { Test-Secret | Out-Null } catch { $caught = $_.Exception }
    Assert-True ($null -ne $caught -and -not $caught.Data['AzureResourceNotFound']) 'Permission, unknown, and transient failures must not create or rotate secrets.'
  }
  $script:probeError = ''; $script:probeResponse = 'not-json'
  $caught = $null
  try { Test-Secret | Out-Null } catch { $caught = $_.Exception }
  Assert-True ($null -ne $caught) 'Invalid JSON must fail closed.'
  Write-Host 'Secret probe tests passed: existing secrets, native stderr/ARM not-found, authorization, transient failures, and malformed JSON.'
} finally { Remove-Item Function:\az -ErrorAction SilentlyContinue }
