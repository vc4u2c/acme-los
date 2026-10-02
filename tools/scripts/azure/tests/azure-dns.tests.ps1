Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../azure-dns.ps1')

function Assert-True($Value, [string]$Message) { if (-not $Value) { throw "Assertion failed: $Message" } }
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch {
    Assert-True ($_.Exception.Message -match $Pattern) "expected $Pattern, got $($_.Exception.Message)"
    return
  }
  throw "Expected failure: $Pattern"
}
function Copy-Object($Value) { return $Value | ConvertTo-Json -Depth 12 | ConvertFrom-Json }
function az { throw 'Unexpected Azure command in offline test' }
function Get-WebPublicNameServers { param($Zone) return $global:publicNs }
function Invoke-AzureDnsJson {
  param([string[]]$Arguments, [switch]$AllowMissing)
  $global:requests.Add(($Arguments -join ' '))
  $method = $Arguments[[array]::IndexOf($Arguments, '--method') + 1]
  $uri = $Arguments[[array]::IndexOf($Arguments, '--uri') + 1]
  if ($uri -eq $global:zoneUri) { return Copy-Object $global:zone }
  Assert-True ($uri -in @($global:cnameUri, $global:txtUri)) 'only two intended record-set IDs are accessed'
  if ($method -eq 'get') {
    if ($global:records.ContainsKey($uri)) { return Copy-Object $global:records[$uri] }
    Assert-True $AllowMissing 'missing record handled explicitly'
    return $null
  }
  Assert-True ($method -eq 'put') 'no delete or whole-zone replacement'
  $headersPath = $Arguments[[array]::IndexOf($Arguments, '--headers') + 1].Substring(1)
  $bodyPath = $Arguments[[array]::IndexOf($Arguments, '--body') + 1].Substring(1)
  $global:temporaryFiles.Add($headersPath)
  $global:temporaryFiles.Add($bodyPath)
  $headers = Get-Content -Raw -LiteralPath $headersPath | ConvertFrom-Json
  $body = Get-Content -Raw -LiteralPath $bodyPath | ConvertFrom-Json
  if ($global:failPut -eq $uri) { throw 'Precondition failed; concurrent DNS writer' }
  if ($global:records.ContainsKey($uri)) {
    Assert-True ($headers.'If-Match' -ceq $global:records[$uri].etag) 'exact quoted ETag reaches Azure'
  } else {
    Assert-True ($headers.'If-None-Match' -ceq '*') 'new records use create-only condition'
  }
  Assert-True ($body.properties.metadata.'acme-owner' -ceq $global:dns.Owner) 'record owner retained'
  $body | Add-Member -NotePropertyName etag -NotePropertyValue '"version-2"'
  $global:records[$uri] = $body
  $global:writes.Add($uri)
  return $body
}
function Invoke-Sync([switch]$Apply) {
  Sync-AzureWebDns $global:dns -Target $global:target -VerificationId ('A' * 64) `
    -ContainerAppName 'ca-acme-los-web-dev-cus-01' -Apply:$Apply -ConfirmZone 'los.example.test'
}
function Add-ExistingRecords {
  $global:records[$global:cnameUri] = @{ etag='"version-1"'; properties=@{TTL=600; metadata=@{'acme-owner'=$global:dns.Owner; purpose='retain-me'}; CNAMERecord=@{cname='ca-acme-los-web-dev-cus-01.old-env.centralus.azurecontainerapps.io'} } }
  $global:records[$global:txtUri] = @{ etag='"version-1"'; properties=@{TTL=600; metadata=@{'acme-owner'=$global:dns.Owner}; TXTRecords=@(@{value=@('B' * 64)}) } }
}
$tests = [ordered]@{
  'configuration resolves a platform child zone without changing runtime activation' = {
    Assert-True ($global:dns.HostLabel -ceq 'apply-dev') 'relative app label'
    Assert-True ($global:dns.ZoneId -eq '/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/rg-acme-los-dns-cus-01/providers/Microsoft.Network/dnsZones/los.example.test') 'platform resource ID'
    foreach ($enabled in @($false, $true)) {
      $global:configuration.environments.dev.publicDomain.enabled = $enabled
      Get-AzureWebDnsSettings $global:configuration 'dev' | Out-Null
      Assert-True ($global:configuration.environments.dev.publicDomain.enabled -eq $enabled) 'runtime activation remains unchanged'
    }
  }
  'root zones, outside hostnames, extra app levels, invalid labels, and other providers are rejected' = {
    $global:configuration.environments.dev.publicDomain.dns.zone = 'example.test'
    Assert-Fails { Get-AzureWebDnsSettings $global:configuration 'dev' } 'dedicated delegated'
    $global:configuration.environments.dev.publicDomain.dns.zone = 'los.example.test'
    foreach ($hostValue in @('other.example.test', 'deep.apply-dev.los.example.test', '-bad.los.example.test', 'APPLY.los.example.test')) {
      $global:configuration.environments.dev.publicDomain.hostname = $hostValue
      Assert-Fails { Get-AzureWebDnsSettings $global:configuration 'dev' } 'dedicated delegated'
    }
    $global:configuration.environments.dev.publicDomain.dns.provider = 'other'
    Assert-Fails { Get-AzureWebDnsSettings $global:configuration 'dev' } 'provider azure'
  }
  'production and wrong zone confirmation cannot write' = {
    Assert-Fails { Get-AzureWebDnsSettings $global:configuration 'prod' } 'restricted to dev'
    Assert-Fails { Sync-AzureWebDns $global:dns -Apply -ConfirmZone 'example.test' } 'ConfirmDnsZone'
    Assert-True ($global:requests.Count -eq 0) 'no Azure call before rejection'
  }
  'dry-run returns two changes without writes' = {
    $result = Invoke-Sync
    Assert-True ($result.changedRecords -eq 2 -and -not $result.applied) 'read-only plan'
    Assert-True ($global:writes.Count -eq 0) 'no write'
  }
  'new records use conditional creation and readback' = {
    $result = Invoke-Sync -Apply
    Assert-True ($result.changedRecords -eq 2 -and $global:writes.Count -eq 2) 'two records created'
    foreach ($path in $global:temporaryFiles) { Assert-True (-not (Test-Path -LiteralPath $path)) 'temporary payload removed' }
  }
  'rebuild updates only source-owned records and preserves metadata and TTL' = {
    Add-ExistingRecords
    Invoke-Sync -Apply | Out-Null
    Assert-True ($global:records[$global:cnameUri].properties.TTL -eq 600) 'existing TTL retained'
    Assert-True ($global:records[$global:cnameUri].properties.metadata.purpose -eq 'retain-me') 'unrelated metadata retained'
  }
  'repeat sync is idempotent' = {
    Invoke-Sync -Apply | Out-Null
    $result = Invoke-Sync -Apply
    Assert-True ($result.changedRecords -eq 0 -and $global:writes.Count -eq 2) 'no duplicate writes'
  }
  'rebuild restores owned empty CNAME records with metadata and TTL intact' = {
    foreach ($shape in @('missing', 'null')) {
      Add-ExistingRecords
      if ($shape -eq 'missing') { $global:records[$global:cnameUri].properties.Remove('CNAMERecord') }
      else { $global:records[$global:cnameUri].properties.CNAMERecord = $null }
      Invoke-Sync -Apply | Out-Null
      Assert-True ($global:records[$global:cnameUri].properties.CNAMERecord.cname -eq $global:target) 'owned empty record filled'
      Assert-True ($global:records[$global:cnameUri].properties.TTL -eq 600 -and $global:records[$global:cnameUri].properties.metadata.purpose -eq 'retain-me') 'metadata and TTL unchanged'
    }
  }
  'unowned empty CNAME is never claimed during rebuild' = {
    Add-ExistingRecords
    $global:records[$global:cnameUri].properties.Remove('CNAMERecord')
    $global:records[$global:cnameUri].properties.metadata.'acme-owner' = 'other-owner'
    Assert-Fails { Invoke-Sync -Apply } 'not source-owned'
    Assert-True ($global:writes.Count -eq 0) 'no writes'
  }
  'unowned TXT blocks both writes before CNAME is touched' = {
    Add-ExistingRecords
    $global:records[$global:txtUri].properties.metadata.'acme-owner' = 'someone-else'
    Assert-Fails { Invoke-Sync -Apply } 'not source-owned'
    Assert-True ($global:writes.Count -eq 0) 'both records checked before write'
  }
  'missing ETag cannot become an unconditional overwrite' = {
    Add-ExistingRecords
    $global:records[$global:cnameUri].etag = ''
    Assert-Fails { Invoke-Sync -Apply } 'ETag'
    Assert-True ($global:writes.Count -eq 0) 'no write'
  }
  'multiple TXT records are never silently collapsed' = {
    Add-ExistingRecords
    $global:records[$global:txtUri].properties.TXTRecords += @{value=@('another-value')}
    Assert-Fails { Invoke-Sync -Apply } 'multiple records'
  }
  'concurrent modification fails without retry or rollback' = {
    Add-ExistingRecords
    $global:failPut = $global:txtUri
    Assert-Fails { Invoke-Sync -Apply } 'Precondition failed'
    Assert-True ($global:writes.Count -eq 1) 'CNAME changed, TXT failed; no false success'
    foreach ($path in $global:temporaryFiles) { Assert-True (-not (Test-Path -LiteralPath $path)) 'temporary payload removed on failure' }
    $global:failPut = ''
    $result = Invoke-Sync -Apply
    Assert-True ($result.changedRecords -eq 1) 'explicit rerun completes remaining change'
  }
  'wrong app target and verification ID are rejected before Azure calls' = {
    $global:target = 'unrelated.new-env.centralus.azurecontainerapps.io'
    Assert-Fails { Invoke-Sync -Apply } 'expected Azure Container App'
    Assert-Fails { Sync-AzureWebDns $global:dns -Target 'ca-acme-los-web-dev-cus-01.new-env.centralus.azurecontainerapps.io' -ContainerAppName 'ca-acme-los-web-dev-cus-01' -VerificationId 'invalid' } 'expected Azure Container App'
    Assert-True ($global:requests.Count -eq 0) 'no requests'
  }
  'unowned or private zones are rejected' = {
    $global:zone.properties.zoneType = 'Private'
    Assert-Fails { Get-AzureWebDnsZone $global:dns } 'does not match'
    $global:zone.properties.zoneType = 'Public'
    $global:zone.tags.acmeLifecycle = 'delete'
    Assert-Fails { Get-AzureWebDnsZone $global:dns } 'does not match'
    $global:zone.tags = @{}
    Assert-Fails { Get-AzureWebDnsZone $global:dns } 'does not match'
  }
  'delegation requires all four assigned Azure nameservers' = {
    $zone = Copy-Object $global:zone
    Assert-AzureWebDnsDelegation $global:dns $zone
    $global:publicNs = @('dns1.registrar-servers.com')
    Assert-Fails { Assert-AzureWebDnsDelegation $global:dns $zone } 'not delegated'
    $global:publicNs = @()
    Assert-Fails { Assert-AzureWebDnsDelegation $global:dns $zone } 'not delegated'
  }
  'zone bootstrap is platform-owned, retained, and role-scoped' = {
    $root = Join-Path $PSScriptRoot '../../../../infra/azure/bicep'
    $entry = Get-Content -Raw (Join-Path $root 'main.public-dns.sub.bicep')
    $module = Get-Content -Raw (Join-Path $root 'modules/shared/public-dns.bicep')
    Assert-True ($entry.Contains("targetScope = 'subscription'") -and $entry.Contains("'acme:lifecycle': 'retain'")) 'separate retained platform entrypoint'
    Assert-True ($module.Contains("level: 'CanNotDelete'") -and $module.Contains('scope: zone')) 'delete protection and zone-scoped role'
    Assert-True ($module.Contains('befefa01-2a29-4197-83a8-272ff33ce314')) 'DNS Zone Contributor, not subscription Contributor'
    Assert-True ($module.Contains("acmeApplication: tags['acme:application']")) 'DNS-compatible ownership tags map to platform metadata'
  }
  'bootstrap read-only plan works as a fresh PowerShell process with default config' = {
    $executable = (Get-Process -Id $PID).Path
    $output = & $executable -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot '../bootstrap-public-dns.ps1') -Action show-plan -PlatformSubscriptionId '11111111-1111-1111-1111-111111111111'
    Assert-True ($LASTEXITCODE -eq 0) 'bootstrap starts without caller-scope variables'
    $plan = $output | ConvertFrom-Json
    Assert-True ($plan.zone -eq 'los.avanai.net' -and $plan.hostname -eq 'apply-dev.los.avanai.net') 'planned child zone and hostname'
  }
}
foreach ($test in $tests.GetEnumerator()) {
  $global:configuration = Get-Content -Raw (Join-Path $PSScriptRoot '../../../../infra/azure/config/platform.json') | ConvertFrom-Json
  $global:configuration.environments.dev.publicDomain.hostname = 'apply-dev.los.example.test'
  $global:configuration.environments.dev.publicDomain.dns.zone = 'los.example.test'
  $global:dns = Get-AzureWebDnsConfiguration $global:configuration 'dev' '11111111-1111-1111-1111-111111111111'
  $global:target = 'ca-acme-los-web-dev-cus-01.new-env.centralus.azurecontainerapps.io'
  $global:zoneUri = "https://management.azure.com$($global:dns.ZoneId)?api-version=2018-05-01"
  $global:cnameUri = "https://management.azure.com$($global:dns.ZoneId)/CNAME/apply-dev?api-version=2018-05-01"
  $global:txtUri = "https://management.azure.com$($global:dns.ZoneId)/TXT/asuid.apply-dev?api-version=2018-05-01"
  $global:publicNs = @('ns1.example.test', 'ns2.example.test', 'ns3.example.test', 'ns4.example.test')
  $global:zone = @{id=$global:dns.ZoneId; properties=@{zoneType='Public'; nameServers=$global:publicNs}; tags=@{acmeApplication='acme-los'; acmeLifecycle='retain'} }
  $global:records = @{}
  $global:requests = [Collections.Generic.List[string]]::new()
  $global:writes = [Collections.Generic.List[string]]::new()
  $global:temporaryFiles = [Collections.Generic.List[string]]::new()
  $global:failPut = ''
  try { & $test.Value } catch { throw "FAIL $($test.Key): $($_.Exception.Message)" }
  Write-Host "PASS $($test.Key)"
}
Write-Host "$($tests.Count) Azure DNS safety tests passed. No Azure or DNS calls were made."
