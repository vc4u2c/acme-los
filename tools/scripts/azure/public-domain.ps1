Set-StrictMode -Version Latest

function Assert-WebPublicDomainConfiguration {
  param($Configuration, [string]$EnvironmentName, [switch]$SyncPublicDns, [string]$ConfirmDnsZone)

  $environment = $Configuration.environments.PSObject.Properties[$EnvironmentName].Value
  $property = $environment.PSObject.Properties['publicDomain']
  $domain = if ($property) { $property.Value } else { $null }
  $enabled = $domain -and $domain.enabled -eq $true
  if ($enabled -and ($domain.hostname -cnotmatch '^[a-z0-9-]+(?:\.[a-z0-9-]+){2,}$' -or $domain.managedCertificateValidationMethod -ne 'CNAME')) {
    throw 'Custom domains require a lower-case subdomain and CNAME validation.'
  }
  if ($SyncPublicDns) {
    if (-not $enabled -or $EnvironmentName -ne 'dev') { throw 'Automatic DNS deployment requires an enabled dev publicDomain.' }
    . (Join-Path $PSScriptRoot 'azure-dns.ps1')
    # Configuration validation must not need Azure access before the hibernation guard.
    $dns = Get-AzureWebDnsSettings $Configuration $EnvironmentName
    if ($ConfirmDnsZone -cne $dns.Zone) { throw 'ConfirmDnsZone must match the delegated Azure DNS zone.' }
  }
  return $domain
}

function Get-WebCustomDomainInitialPhase {
  param($ContainerApp, [string]$Hostname, [string]$CertificateId)

  if (-not $ContainerApp) { return 'none' }
  $ingress = $ContainerApp.properties.configuration.ingress
  $property = $ingress.PSObject.Properties['customDomains']
  $domains = @(if ($property) { $property.Value | Where-Object { $null -ne $_ } })
  if (@($domains | Where-Object { $_.name -ne $Hostname }).Count -gt 0 -or $domains.Count -gt 1) {
    throw 'Unmanaged custom domains are attached to this app. Refusing to overwrite their bindings.'
  }
  if ($domains.Count -eq 1 -and $domains[0].bindingType -eq 'SniEnabled') {
    if ($domains[0].certificateId -ne $CertificateId) { throw 'The current hostname uses an unmanaged certificate; migration requires review.' }
    return 'bind'
  }
  return 'none'
}

function Invoke-WebCustomDomainDeployment {
  param([ValidateSet('none', 'bind')][string]$InitialPhase, [scriptblock]$DeployRuntime,
    [scriptblock]$VerifyDns, [scriptblock]$IssueCertificate, [scriptblock]$VerifyHttps)

  # New environments need an app before DNS verification and hostname registration.
  # Never remove a working HTTPS binding during an ordinary redeployment.
  $runtime = & $DeployRuntime $InitialPhase
  & $VerifyDns | Out-Null
  if ($InitialPhase -ne 'bind') { $runtime = & $DeployRuntime 'register' }
  & $IssueCertificate | Out-Null
  $runtime = & $DeployRuntime 'bind'
  & $VerifyHttps | Out-Null
  return $runtime
}

function Wait-WebCustomDomainHealth {
  param([string]$Hostname, [string]$EnvironmentName, [string]$BuildId,
    [ValidateRange(1, 60)][int]$Attempts = 30, [ValidateRange(1, 60)][int]$RetrySeconds = 10)

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "https://$Hostname/api/health" -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
      $health = $response.Content | ConvertFrom-Json
      if ($response.StatusCode -eq 200 -and $health.status -eq 'ok' -and $health.service -eq 'web-app' -and
        $health.environment -eq $EnvironmentName -and $health.build -eq $BuildId -and
        $health.layers.bff.status -eq 'ok' -and $health.layers.bff.build -eq $BuildId) { return }
    } catch { }
    if ($attempt -lt $Attempts) { Start-Sleep -Seconds $RetrySeconds }
  }
  throw 'Custom-domain HTTPS health or build verification failed. DNS/certificate recovery is incomplete; inspect before retrying.'
}

function Wait-WebManagedCertificate {
  param([string]$CertificateId, [string]$Hostname,
    [ValidateRange(1, 120)][int]$Attempts = 60, [ValidateRange(1, 60)][int]$RetrySeconds = 10)

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $certificate = Invoke-AzJson -Arguments @('rest', '--method', 'get', '--uri', "https://management.azure.com${CertificateId}?api-version=2025-01-01")
    if ($certificate.id -ne $CertificateId -or $certificate.properties.subjectName -ne $Hostname) {
      throw 'Managed certificate identity does not match the requested app hostname.'
    }
    $state = $certificate.properties.provisioningState
    if ($state -eq 'Succeeded') { return }
    if ($state -notin @('Pending', 'Creating', 'Updating', 'InProgress')) {
      throw 'Managed certificate issuance did not succeed. Inspect Azure before retrying; the hostname was not bound.'
    }
    if ($attempt -lt $Attempts) { Start-Sleep -Seconds $RetrySeconds }
  }
  throw 'Managed certificate issuance is still pending. Retry after reviewing Azure; the hostname was not bound.'
}
