Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'azure-dns.tests.ps1')
& (Join-Path $PSScriptRoot 'public-domain.tests.ps1')
& (Join-Path $PSScriptRoot 'deployment-domain.tests.ps1')
& (Join-Path $PSScriptRoot 'activation-domain.tests.ps1')
& node --test (Join-Path $PSScriptRoot 'verify-public-dns.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Public DNS tests failed.' }
