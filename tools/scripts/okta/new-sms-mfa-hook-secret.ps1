[CmdletBinding()]
param(
  [string]$Username = 'acme-los-okta'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$buffer = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

try {
  $rng.GetBytes($buffer)
} finally {
  $rng.Dispose()
}

$password = [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$credential = [Convert]::ToBase64String(
  [System.Text.Encoding]::UTF8.GetBytes("${Username}:$password")
)
$authorization = "Basic $credential"

Write-Warning 'This value is shown once. Store it as a secret and do not commit it.'
Write-Output "ACME_OKTA_TELEPHONY_HOOK_AUTHORIZATION=$authorization"
