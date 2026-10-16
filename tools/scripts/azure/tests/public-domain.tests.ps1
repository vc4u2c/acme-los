Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../public-domain.ps1')

function Assert-True($Value, [string]$Message) {
  if (-not $Value) { throw "Assertion failed: $Message" }
}
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch {
    Assert-True ($_.Exception.Message -match $Pattern) "expected $Pattern; received $($_.Exception.Message)"
    return
  }
  throw "Expected failure: $Pattern"
}
function az { throw 'Unexpected Azure call in offline test' }
function Invoke-AzJson {
  param([string[]]$Arguments)
  Assert-True (($Arguments -join ' ') -eq 'rest --method get --uri https://management.azure.com/certificate?api-version=2025-01-01') 'certificate read only'
  return $global:certificate
}
function Start-Sleep { throw 'Unexpected wait in offline test' }
function Invoke-WebRequest {
  param([switch]$UseBasicParsing, $Uri, $TimeoutSec, $MaximumRedirection, $ErrorAction)
  Assert-True ($Uri -ceq 'https://apply-dev.example.test/api/health' -and $MaximumRedirection -eq 0) 'TLS and no redirects'
  return [pscustomobject]@{ StatusCode = 200; Content = ($global:health | ConvertTo-Json -Depth 6) }
}
function Invoke-Stages([string]$Phase = 'none') {
  Invoke-WebCustomDomainDeployment -InitialPhase $Phase -DeployRuntime {
    param($phase)
    $global:events.Add($phase)
    if ($global:failure -eq $phase) { throw "Failed $phase" }
    return [pscustomobject]@{ phase = $phase }
  } -VerifyDns {
    $global:events.Add('dns')
    if ($global:failure -eq 'dns') { throw 'DNS failed' }
  } -IssueCertificate {
    $global:events.Add('certificate')
    if ($global:failure -eq 'certificate') { throw 'Certificate failed' }
  } -VerifyHttps {
    $global:events.Add('https')
    if ($global:failure -eq 'https') { throw 'HTTPS failed' }
  }
}
$tests = [ordered]@{
  'cold start follows app, DNS, registration, certificate, TLS binding, and health order' = {
    $result = Invoke-Stages
    Assert-True (($global:events -join ',') -ceq 'none,dns,register,certificate,bind,https') 'cold start order'
    Assert-True ($result.phase -eq 'bind') 'only final runtime returned'
  }
  'redeployment never removes an existing TLS binding' = {
    Invoke-Stages 'bind' | Out-Null
    Assert-True (($global:events -join ',') -ceq 'bind,dns,certificate,bind,https') 'no none/register phases'
  }
  'failed DNS prevents registration and certificate issuance' = {
    $global:failure = 'dns'
    Assert-Fails { Invoke-Stages } 'DNS failed'
    Assert-True (($global:events -join ',') -ceq 'none,dns') 'fail stop'
  }
  'failed registration prevents certificate issuance' = {
    $global:failure = 'register'
    Assert-Fails { Invoke-Stages } 'Failed register'
    Assert-True (($global:events -join ',') -ceq 'none,dns,register') 'fail stop'
  }
  'failed certificate prevents SNI binding and health success' = {
    $global:failure = 'certificate'
    Assert-Fails { Invoke-Stages } 'Certificate failed'
    Assert-True (-not $global:events.Contains('bind')) 'not bound'
  }
  'failed HTTPS does not report a recovered environment' = {
    $global:failure = 'https'
    Assert-Fails { Invoke-Stages } 'HTTPS failed'
  }
  'missing app starts without a hostname' = {
    Assert-True ((Get-WebCustomDomainInitialPhase $null 'apply-dev.example.test' '/certificate') -eq 'none') 'bootstrap app'
  }
  'source-owned HTTPS binding is preserved' = {
    $app = @{ properties = @{ configuration = @{ ingress = @{ customDomains = @(@{name='apply-dev.example.test'; bindingType='SniEnabled'; certificateId='/certificate'}) } } } } | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    Assert-True ((Get-WebCustomDomainInitialPhase $app 'apply-dev.example.test' '/certificate') -eq 'bind') 'preserve binding'
  }
  'unmanaged domains and certificates are not overwritten' = {
    $app = @{ properties = @{ configuration = @{ ingress = @{ customDomains = @(@{name='other.example.test'; bindingType='SniEnabled'; certificateId='/certificate'}) } } } } | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    Assert-Fails { Get-WebCustomDomainInitialPhase $app 'apply-dev.example.test' '/certificate' } 'Unmanaged custom domains'
    $app.properties.configuration.ingress.customDomains[0].name = 'apply-dev.example.test'
    Assert-Fails { Get-WebCustomDomainInitialPhase $app 'apply-dev.example.test' '/other' } 'unmanaged certificate'
  }
  'disabled domains and unconfirmed DNS writes are rejected' = {
    $configuration = Get-Content -Raw (Join-Path $PSScriptRoot '../../../../infra/azure/config/platform.json') | ConvertFrom-Json
    $configuration.environments.dev.publicDomain.enabled = $false
    Assert-Fails { Assert-WebPublicDomainConfiguration $configuration 'dev' -SyncPublicDns -ConfirmDnsZone 'los.avanai.net' } 'enabled dev publicDomain'
    $configuration.environments.dev.publicDomain.enabled = $true
    Assert-Fails { Assert-WebPublicDomainConfiguration $configuration 'dev' -SyncPublicDns -ConfirmDnsZone 'other.test' } 'ConfirmDnsZone'
    Assert-WebPublicDomainConfiguration $configuration 'dev' -SyncPublicDns -ConfirmDnsZone 'los.avanai.net' | Out-Null
  }
  'public health checks the environment and both build identities' = {
    Wait-WebCustomDomainHealth 'apply-dev.example.test' 'dev' 'build-test' -Attempts 1
    $global:health.layers.bff.build = 'old-build'
    Assert-Fails { Wait-WebCustomDomainHealth 'apply-dev.example.test' 'dev' 'build-test' -Attempts 1 } 'verification failed'
  }
  'degraded health is not ready' = {
    $global:health.status = 'degraded'
    Assert-Fails { Wait-WebCustomDomainHealth 'apply-dev.example.test' 'dev' 'build-test' -Attempts 1 } 'verification failed'
  }
  'certificate must finish issuance before SNI binding' = {
    Wait-WebManagedCertificate '/certificate' 'apply-dev.example.test' -Attempts 1
    $global:certificate.properties.provisioningState = 'Pending'
    Assert-Fails { Wait-WebManagedCertificate '/certificate' 'apply-dev.example.test' -Attempts 1 } 'still pending'
    $global:certificate.properties.provisioningState = 'Failed'
    Assert-Fails { Wait-WebManagedCertificate '/certificate' 'apply-dev.example.test' -Attempts 1 } 'did not succeed'
  }
  'certificate subject mismatch is rejected' = {
    $global:certificate.properties.subjectName = 'wrong.example.test'
    Assert-Fails { Wait-WebManagedCertificate '/certificate' 'apply-dev.example.test' -Attempts 1 } 'identity does not match'
  }
}
foreach ($test in $tests.GetEnumerator()) {
  $global:events = [Collections.Generic.List[string]]::new()
  $global:failure = ''
  $global:health = @{ status='ok'; service='web-app'; environment='dev'; build='build-test'; layers=@{ bff=@{status='ok'; build='build-test'} } }
  $global:certificate = @{id='/certificate'; properties=@{subjectName='apply-dev.example.test'; provisioningState='Succeeded'}}
  try { & $test.Value } catch { throw "FAIL $($test.Key): $($_.Exception.Message)" }
  Write-Host "PASS $($test.Key)"
}
Write-Host "$($tests.Count) custom-domain tests passed. No Azure calls were made."
