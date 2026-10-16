Set-StrictMode -Version Latest

function Invoke-AzureDnsJson {
  param([string[]]$Arguments, [switch]$AllowMissing)

  $previousErrorPreference = $ErrorActionPreference
  $stderrPath = [IO.Path]::GetTempFileName()
  try {
    $ErrorActionPreference = 'Continue'
    $output = & az @Arguments --output json --only-show-errors 2> $stderrPath
    $exitCode = $LASTEXITCODE
    $stderr = [IO.File]::ReadAllText($stderrPath)
  } finally {
    $ErrorActionPreference = $previousErrorPreference
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
  $payload = [string]::Join([Environment]::NewLine, @($output))
  if ($exitCode -ne 0) {
    $resourceMissing = "$payload`n$stderr" -match '\((ResourceNotFound|ParentResourceNotFound|ResourceGroupNotFound|DeploymentStackNotFound|DeploymentStackResourceNotFound)\)|"code"\s*:\s*"(ResourceNotFound|ParentResourceNotFound|ResourceGroupNotFound|DeploymentStackNotFound|DeploymentStackResourceNotFound|NotFound)"'
    if ($AllowMissing -and $resourceMissing) { return $null }
    $failure = [InvalidOperationException]::new('Azure DNS request failed. Check Azure access and deployment diagnostics; no automatic rollback was attempted.')
    # Preserve a typed missing-resource signal without exposing provider output.
    $failure.Data['AzureResourceNotFound'] = [bool]$resourceMissing
    throw $failure
  }
  if ([string]::IsNullOrWhiteSpace($payload)) { return $null }
  try { return $payload | ConvertFrom-Json } catch { throw 'Azure returned invalid JSON. Provider output was suppressed; inspect Azure before retrying.' }
}

function Get-AzureWebDnsSettings {
  param($Configuration, [string]$EnvironmentName)

  if ($EnvironmentName -cne 'dev') { throw 'Automatic public DNS management is restricted to dev.' }
  $domain = $Configuration.environments.dev.publicDomain
  $dns = $domain.PSObject.Properties['dns']
  if (-not $dns -or $dns.Value.provider -cne 'azure') { throw 'Configure publicDomain.dns with provider azure.' }
  $zone = [string]$dns.Value.zone
  $hostname = [string]$domain.hostname
  $labelPattern = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
  if ($zone.Length -gt 253 -or $zone -cnotmatch "^$labelPattern(?:\.$labelPattern){2,}$" -or
    $hostname.Length -gt 253 -or $hostname -cnotmatch ("^$labelPattern\." + [regex]::Escape($zone) + '$')) {
    throw 'Public DNS requires a dedicated delegated subdomain zone and a single app label beneath it.'
  }
  $resourceGroup = [string]$Configuration.platformResources.publicDnsResourceGroupName
  if ($resourceGroup -cnotmatch '^rg-[a-z0-9-]+$') { throw 'Configure a dedicated platform public DNS resource group.' }
  return [pscustomobject]@{
    Zone = $zone
    Hostname = $hostname
    HostLabel = $hostname.Substring(0, $hostname.Length - $zone.Length - 1)
    ResourceGroup = $resourceGroup
    Owner = "$($Configuration.projectName)-$EnvironmentName-web"
  }
}

function Get-AzureWebDnsConfiguration {
  param($Configuration, [string]$EnvironmentName, [string]$PlatformSubscriptionId)

  $settings = Get-AzureWebDnsSettings $Configuration $EnvironmentName
  if (-not $PlatformSubscriptionId) {
    $accounts = @(Invoke-AzureDnsJson @('account', 'list') | ForEach-Object { $_ } | Where-Object { $_.name -eq $Configuration.subscriptions.platform })
    if ($accounts.Count -ne 1) { throw 'Unable to resolve the platform subscription for public DNS.' }
    $PlatformSubscriptionId = [string]$accounts[0].id
  }
  if ($PlatformSubscriptionId -notmatch '^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$') { throw 'A valid platform subscription ID is required.' }
  $settings | Add-Member -NotePropertyName SubscriptionId -NotePropertyValue $PlatformSubscriptionId
  $settings | Add-Member -NotePropertyName ZoneId -NotePropertyValue "/subscriptions/$PlatformSubscriptionId/resourceGroups/$($settings.ResourceGroup)/providers/Microsoft.Network/dnsZones/$($settings.Zone)"
  return $settings
}

function Get-AzureWebDnsZone {
  param($DnsConfiguration, [switch]$AllowMissing)

  $zone = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', "https://management.azure.com$($DnsConfiguration.ZoneId)?api-version=2018-05-01") -AllowMissing:$AllowMissing
  if (-not $zone) {
    if ($AllowMissing) { return $null }
    throw 'Bootstrap the retained Azure public DNS zone before deploying the app hostname.'
  }
  $tagsProperty = $zone.PSObject.Properties['tags']
  $applicationTag = if ($tagsProperty -and $tagsProperty.Value) { $tagsProperty.Value.PSObject.Properties['acmeApplication'] } else { $null }
  $lifecycleTag = if ($tagsProperty -and $tagsProperty.Value) { $tagsProperty.Value.PSObject.Properties['acmeLifecycle'] } else { $null }
  if ($zone.id -ine $DnsConfiguration.ZoneId -or $zone.properties.zoneType -ne 'Public' -or
    -not $applicationTag -or $applicationTag.Value -cne 'acme-los' -or
    -not $lifecycleTag -or $lifecycleTag.Value -cne 'retain') {
    throw 'The Azure DNS zone does not match the retained ACME LOS platform zone. Refusing to adopt it.'
  }
  return $zone
}

function Get-WebPublicNameServers {
  param([string]$Zone)

  $previousErrorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & node (Join-Path $PSScriptRoot 'verify-public-dns.mjs') zone $Zone 2>&1
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousErrorPreference }
  if ($exitCode -ne 0) { throw 'Public DNS lookup failed. Do not assume the subdomain is unused or delegated.' }
  $result = [string]::Join([Environment]::NewLine, @($output)) | ConvertFrom-Json
  if ($result.zone -cne $Zone) { throw 'Unexpected public DNS lookup result.' }
  return $result.nameServers
}

function Assert-AzureWebDnsDelegation {
  param($DnsConfiguration, $Zone)

  $expected = @($Zone.properties.nameServers | ForEach-Object { $_.TrimEnd('.').ToLowerInvariant() } | Sort-Object -Unique)
  $actual = @(Get-WebPublicNameServers $DnsConfiguration.Zone | ForEach-Object { $_.TrimEnd('.').ToLowerInvariant() } | Sort-Object -Unique)
  if ($expected.Count -ne 4 -or ($expected -join ',') -cne ($actual -join ',')) {
    throw 'The child zone is not delegated to its four Azure nameservers. Complete the one-time Namecheap NS setup first.'
  }
}

function Set-AzureWebDnsRecord {
  param([string]$Uri, $Properties, [string]$Etag)

  $bodyFile = [IO.Path]::GetTempFileName()
  $headersFile = [IO.Path]::GetTempFileName()
  try {
    $headers = @{ 'Content-Type' = 'application/json' }
    if ($Etag) { $headers['If-Match'] = $Etag } else { $headers['If-None-Match'] = '*' }
    # JSON files preserve quoted ETags and TXT values on both Windows PowerShell and pwsh.
    $utf8 = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($bodyFile, (@{ properties = $Properties } | ConvertTo-Json -Depth 8 -Compress), $utf8)
    [IO.File]::WriteAllText($headersFile, ($headers | ConvertTo-Json -Compress), $utf8)
    $null = Invoke-AzureDnsJson @('rest', '--method', 'put', '--uri', $Uri, '--headers', "@$headersFile", '--body', "@$bodyFile")
  } finally {
    Remove-Item -LiteralPath $bodyFile, $headersFile -Force -ErrorAction SilentlyContinue
  }
}

function Sync-AzureWebDns {
  param($DnsConfiguration, [string]$Target, [string]$VerificationId, [string]$ContainerAppName,
    [switch]$Apply, [string]$ConfirmZone)

  if ($Apply -and $ConfirmZone -cne $DnsConfiguration.Zone) { throw 'ConfirmDnsZone must exactly match the delegated zone.' }
  if ($ContainerAppName -cnotmatch '^ca-[a-z0-9-]+$' -or
    $Target -cnotmatch ('^' + [regex]::Escape($ContainerAppName) + '\.[a-z0-9-]+\.[a-z0-9-]+\.azurecontainerapps\.io$') -or
    $VerificationId -cnotmatch '^[a-fA-F0-9]{64}$') {
    throw 'DNS values must come from the expected Azure Container App and its verification ID.'
  }
  $null = Get-AzureWebDnsZone $DnsConfiguration
  $records = @(
    @{ Type = 'CNAME'; Name = $DnsConfiguration.HostLabel; ValueKey = 'CNAMERecord'; Value = @{ cname = $Target } },
    @{ Type = 'TXT'; Name = "asuid.$($DnsConfiguration.HostLabel)"; ValueKey = 'TXTRecords'; Value = @(@{ value = @($VerificationId) }) }
  )
  $changes = @()
  # Validate both records before writing either. The two conditional PUTs are not an atomic transaction.
  foreach ($record in $records) {
    $uri = "https://management.azure.com$($DnsConfiguration.ZoneId)/$($record.Type)/$($record.Name)?api-version=2018-05-01"
    $current = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', $uri) -AllowMissing
    $properties = @{ TTL = 300; metadata = @{ 'acme-owner' = $DnsConfiguration.Owner } }
    $properties[$record.ValueKey] = $record.Value
    $etag = $null
    if ($current) {
      $metadata = $current.properties.PSObject.Properties['metadata']
      $owner = if ($metadata) { $metadata.Value.PSObject.Properties['acme-owner'] } else { $null }
      if (-not $owner -or $owner.Value -cne $DnsConfiguration.Owner) { throw 'An app DNS record is not source-owned. Refusing to overwrite it.' }
      $etag = [string]$current.etag
      if ([string]::IsNullOrWhiteSpace($etag)) { throw 'Azure did not return an ETag; refusing an unconditional DNS update.' }
      $value = $current.properties.PSObject.Properties[$record.ValueKey]
      if ($record.Type -eq 'CNAME') {
        # Retirement retains an empty, source-owned record set under the zone's deletion lock.
        $matches = $value -and $value.Value -and $value.Value.cname.TrimEnd('.') -ieq $Target
      } else {
        if (-not $value) { throw 'The existing DNS record has an unexpected shape.' }
        $values = @($value.Value)
        $matches = $values.Count -eq 1 -and (($values[0].value -join '') -ceq $VerificationId)
        if ($values.Count -ne 1) { throw 'The app verification TXT contains multiple records. Review before replacing it.' }
      }
      if ($matches) { continue }
      # Retain record metadata and TTL when the app target changes after recreation.
      $properties.TTL = $current.properties.TTL
      $properties.metadata = $metadata.Value
    }
    $changes += @{ uri = $uri; properties = $properties; etag = $etag }
  }
  if ($Apply) {
    foreach ($change in $changes) { Set-AzureWebDnsRecord -Uri $change.uri -Properties $change.properties -Etag $change.etag }
    foreach ($record in $records) {
      $uri = "https://management.azure.com$($DnsConfiguration.ZoneId)/$($record.Type)/$($record.Name)?api-version=2018-05-01"
      $observed = Invoke-AzureDnsJson @('rest', '--method', 'get', '--uri', $uri)
      $value = $observed.properties.PSObject.Properties[$record.ValueKey].Value
      $matches = if ($record.Type -eq 'CNAME') { $value.cname.TrimEnd('.') -ieq $Target } else { @($value).Count -eq 1 -and (($value[0].value -join '') -ceq $VerificationId) }
      if (-not $matches) { throw 'Azure DNS readback did not match. Stop and inspect before retrying.' }
    }
  }
  return [ordered]@{ provider = 'azure'; zone = $DnsConfiguration.Zone; changedRecords = $changes.Count; applied = [bool]$Apply }
}
