Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$deployPath = Join-Path $PSScriptRoot '../deploy-web-environment.ps1'
$domainPath = Join-Path $PSScriptRoot '../configure-web-custom-domain.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($deployPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'Deployment script parse failed' }
foreach ($name in @('Invoke-AzJson', 'ConvertTo-ObjectArray')) {
  $definition = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  . ([scriptblock]::Create($definition[0].Extent.Text))
}
. (Join-Path $PSScriptRoot '../public-domain.ps1')
. (Join-Path $PSScriptRoot '../azure-dns.ps1')
$global:nativeNode = (Get-Command node -CommandType Application).Source
$global:nativeFixture = Join-Path $PSScriptRoot 'fixtures/native-command.mjs'

function Assert-True($Value, [string]$Message) {
  if (-not $Value) { throw "Assertion failed: $Message" }
}
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch {
    Assert-True ($_.Exception.Message -match $Pattern) "expected $Pattern, got $($_.Exception.Message)"
    return
  }
  throw "Expected failure: $Pattern"
}
function az {
  if ($global:azMode -eq 'json') {
    $global:LASTEXITCODE = 0
    return $global:azJson
  }
  & $global:nativeNode $global:nativeFixture $global:azMode
  $global:LASTEXITCODE = $LASTEXITCODE
}
function node {
  $global:dnsCalls++
  & $global:nativeNode $global:nativeFixture $(if ($global:dnsCalls -lt $global:dnsSucceedOn) { 'stderr' } else { 'ok' })
  $global:LASTEXITCODE = $LASTEXITCODE
}
function Start-Sleep { param($Seconds) $global:sleeps++ }
function Invoke-VerifyDns([int]$Attempts = 3) {
  & $domainPath -EnvironmentName dev -Action verify-dns -DnsAttempts $Attempts -DnsRetrySeconds 1 `
    -SubscriptionId '11111111-1111-1111-1111-111111111111' -ConfigurationPath (Join-Path $root 'infra/azure/config/platform.json')
}
$tests = [ordered]@{
  'Azure DNS and activation parse stdout independently of successful native progress' = {
    $global:azMode = 'progress'
    $result = Invoke-AzureDnsJson @('containerapp', 'hostname', 'add')
    Assert-True ($result.status -eq 'ok') 'progress on stderr is not JSON'
  }
  'Azure DNS preserves explicit missing-resource handling without exposing provider errors' = {
    $global:azMode = 'missing'
    Assert-True ($null -eq (Invoke-AzureDnsJson @('rest') -AllowMissing)) '404 is explicitly allowed'
    Assert-Fails { Invoke-AzureDnsJson @('rest') } 'Azure DNS request failed'
    $global:azMode = 'stderr'
    Assert-Fails { Invoke-AzureDnsJson @('rest') -AllowMissing } 'Azure DNS request failed'
  }
  'Azure DNS invalid JSON output is suppressed' = {
    $global:azMode = 'malformed'
    $output = & { try { Invoke-AzureDnsJson @('rest') } catch { $_ | Out-String } } *>&1 | Out-String
    Assert-True (-not $output.Contains('synthetic-secret-from-provider')) 'no malformed provider payload in errors'
    Assert-True ($output.Contains('Provider output was suppressed')) 'safe diagnostic'
  }
  'Azure JSON app arrays are enumerated for zero, one, and multiple apps' = {
    $binding = @{ name='apply-dev.example.test'; bindingType='SniEnabled'; certificateId='/certificate' }
    $web = @{ name='web'; properties=@{ configuration=@{ ingress=@{customDomains=@($binding)} } } }
    $bff = @{ name='bff'; properties=@{ configuration=@{ ingress=@{customDomains=@()} } } }
    foreach ($apps in @(@(), @($web), @($web, $bff))) {
      $global:azJson = ConvertTo-Json -InputObject $apps -Depth 10 -Compress
      $parsed = @(ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('containerapp', 'list')))
      Assert-True ($parsed.Count -eq $apps.Count) 'actual response count'
      $selected = $parsed | Where-Object { $_.name -eq 'web' } | Select-Object -First 1
      $phase = Get-WebCustomDomainInitialPhase $selected 'apply-dev.example.test' '/certificate'
      Assert-True ($phase -eq $(if ($apps.Count -eq 0) { 'none' } else { 'bind' })) 'correct observed binding'
    }
    $binding.name = 'unmanaged.example.test'
    $global:azJson = ConvertTo-Json -InputObject @($web, $bff) -Depth 10 -Compress
    $parsed = @(ConvertTo-ObjectArray (Invoke-AzJson -Arguments @('containerapp', 'list')))
    $selected = $parsed | Where-Object { $_.name -eq 'web' } | Select-Object -First 1
    Assert-Fails { Get-WebCustomDomainInitialPhase $selected 'apply-dev.example.test' '/certificate' } 'Unmanaged custom domains'
  }
  'sensitive native stderr and malformed JSON are redacted from every exposed stream' = {
    foreach ($mode in @('stderr', 'malformed')) {
      $global:azMode = $mode
      $output = & { try { Invoke-AzJson -Arguments @('deployment', 'group', 'create') -Sensitive } catch { $_ | Out-String } } *>&1 | Out-String
      Assert-True (-not $output.Contains('synthetic-secret-from-provider')) 'no secret in success, error, warning, verbose, debug, or information streams'
      Assert-True ($output.Contains('Secret-bearing arguments and provider output were suppressed')) 'redacted failure is visible'
    }
  }
  'native failure preserves caller error preference' = {
    $global:azMode = 'stderr'
    Assert-Fails { Invoke-AzJson -Arguments @('deployment') -Sensitive } 'suppressed'
    Assert-True ($ErrorActionPreference -eq 'Stop') 'error preference restored'
  }
  'DNS wrapper retries native stderr failures then succeeds' = {
    $result = Invoke-VerifyDns | ConvertFrom-Json
    Assert-True ($result.status -eq 'dns-verified' -and $global:dnsCalls -eq 3 -and $global:sleeps -eq 2) 'bounded retries through real script'
  }
  'DNS wrapper stops at retry budget without false success' = {
    $global:dnsSucceedOn = 4
    Assert-Fails { Invoke-VerifyDns } 'did not verify'
    Assert-True ($global:dnsCalls -eq 3) 'exact retry budget'
  }
  'DNS writes are rejected for production before provider calls' = {
    Assert-Fails { & $domainPath -EnvironmentName prod -Action sync-dns -SubscriptionId '11111111-1111-1111-1111-111111111111' } 'does not declare publicDomain'
  }
  'deployment integration wires observation and ordered stages rather than issuing TLS immediately' = {
    $source = Get-Content -Raw $deployPath
    Assert-True ($source.Contains('ConvertTo-ObjectArray (Invoke-AzJson')) 'enumerated CLI results'
    Assert-True ($source.Contains('Invoke-WebCustomDomainDeployment -InitialPhase $initialPhase')) 'staged deployment used'
    Assert-True ($source.Contains('customDomainPhase=$phase')) 'phase passed to full runtime template'
    Assert-True ($source.Contains('Wait-WebManagedCertificate -CertificateId $certificateId')) 'certificate completion checked'
  }
}
foreach ($test in $tests.GetEnumerator()) {
  $global:azMode = 'json'
  $global:dnsCalls = 0
  $global:sleeps = 0
  $global:dnsSucceedOn = 3
  $global:azJson = @{ properties=@{ configuration=@{ ingress=@{fqdn='ca-acme-los-web-dev-cus-01.new-env.centralus.azurecontainerapps.io'} }; customDomainVerificationId=('A' * 64) } } | ConvertTo-Json -Depth 8
  try { & $test.Value } catch { throw "FAIL $($test.Key): $($_.Exception.Message)" }
  Write-Host "PASS $($test.Key)"
}
Write-Host "$($tests.Count) deployment integration tests passed. Only synthetic local subprocesses ran."
