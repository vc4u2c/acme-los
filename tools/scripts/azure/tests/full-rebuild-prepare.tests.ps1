# Execute prepare and interrupted retries with every Azure, HTTP, and DNS boundary mocked.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../full-regional-rebuild.ps1')
$configuration = Get-Content (Join-Path $PSScriptRoot '../../../../infra/azure/config/platform.json') -Raw | ConvertFrom-Json
$global:rebuildScope = Get-FullRegionalRebuildScope $configuration
$entrypoint = Join-Path $PSScriptRoot '../invoke-full-regional-rebuild.ps1'
function Reset-Fixture {
  $global:rebuildFixture = @{ groups = @{}; imported = @{}; moved = $false; oldStack = $true; calls = [Collections.Generic.List[string]]::new(); fail = '' }
  $s = $global:rebuildScope; $f = $global:rebuildFixture
  $f.groups[$s.OldGroup] = @{ location = 'centralus'; tags = @{ 'acme:retirement' = 'retired' } }
  $f.groups[$s.TargetGroup] = @{ location = 'eastus'; tags = @{ 'acme:application' = 'acme-los'; 'acme:environment' = 'dev' } }
}
function Get-Argument($Arguments, $Name) { return $Arguments[[array]::IndexOf($Arguments, $Name) + 1] }
function Missing-Resource { $global:LASTEXITCODE = 1; return 'ERROR: (ResourceNotFound) Synthetic missing resource' }
function global:node {
  $global:LASTEXITCODE = 0
  return '{"zone":"los.avanai.net","nameServers":["ns1.example.test","ns2.example.test","ns3.example.test","ns4.example.test"]}'
}
function global:Invoke-WebRequest {
  param($Method, $Uri, $Headers, $ContentType, $Body, $TimeoutSec, $MaximumRedirection, [switch]$UseBasicParsing)
  $global:rebuildFixture.calls.Add('validate ACS move')
  if ($global:rebuildFixture.fail -eq 'validation') { throw 'Synthetic provider rejection' }
  return @{ StatusCode = 204; Headers = @{} }
}
function global:az {
  $a = [string[]]$args; $cmd = $a -join ' '; $f = $global:rebuildFixture; $s = $global:rebuildScope
  $f.calls.Add($cmd); $global:LASTEXITCODE = 0
  if ($cmd -like 'account show *') { return @{ id = (Get-Argument $a '--subscription'); tenantId = $s.Tenant; state = 'Enabled' } | ConvertTo-Json }
  if ($cmd -like 'account get-access-token *') { return '{"accessToken":"synthetic-token"}' }
  if ($cmd -like 'rest --method get *dnsZones/los.avanai.net*') {
    return @{ id = "/subscriptions/$($s.PlatformSubscription)/resourceGroups/rg-acme-los-dns-cus-01/providers/Microsoft.Network/dnsZones/los.avanai.net"; tags = @{ acmeApplication = 'acme-los'; acmeLifecycle = 'retain' }; properties = @{ zoneType = 'Public'; nameServers = @('ns1.example.test', 'ns2.example.test', 'ns3.example.test', 'ns4.example.test') } } | ConvertTo-Json -Depth 8
  }
  if ($cmd -like 'resource list *' -or $cmd -like 'deployment group list *') { return '[]' }
  if ($cmd -like 'group show *') {
    $name = Get-Argument $a '--name'
    if ($f.groups.ContainsKey($name)) { return $f.groups[$name] | ConvertTo-Json -Depth 8 }
    return Missing-Resource
  }
  if ($cmd -like 'stack * show *') {
    if ((Get-Argument $a '--name') -eq 'stk-acme-los-web-app-dev-cus-01' -and $f.oldStack) {
      return @{ provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }; resources = @(@{ id = $s.OldAcsId }) } | ConvertTo-Json -Depth 8
    }
    if ($f.fail -eq 'target-stack') { return @{ provisioningState = 'succeeded'; denySettings = @{ mode = 'none' }; resources = @(@{ id = '/subscriptions/unrelated/resourceGroups/shared' }) } | ConvertTo-Json -Depth 8 }
    return Missing-Resource
  }
  if ($cmd -like 'stack group delete *') { $f.oldStack = $false; return }
  if ($cmd -like 'deployment sub create *') { $f.groups[$s.TargetMonitorGroup] = @{ location = 'eastus'; tags = @{ 'acme:application' = 'acme-platform' } }; return }
  if ($cmd -like 'stack sub create *') { $f.groups[$s.TargetImagesGroup] = @{ location = 'eastus'; tags = @{ 'acme:application' = 'acme-los'; 'acme:environment' = 'nonprod' } }; return }
  if ($cmd -like 'stack group create *') { return }
  if ($cmd -like 'acr repository list *') { return ConvertTo-Json -InputObject @($f.imported.Keys) -Compress }
  if ($cmd -like 'acr repository show-tags *') { return ConvertTo-Json -InputObject @($s.ImageTag) -Compress }
  if ($cmd -like 'acr manifest show-metadata *') {
    $imageName = Get-Argument $a '--name'
    $image = @($s.Images | Where-Object { $imageName -ceq "$($_.Repository):$($s.ImageTag)" })[0]
    return @{ digest = $image.Digest } | ConvertTo-Json
  }
  if ($cmd -like 'acr import *') {
    $imageName = (Get-Argument $a '--image').Split(':')[0]; $f.imported[$imageName] = $true; return
  }
  if ($cmd -like 'rest --method get *communicationServices*') {
    $id = (Get-Argument $a '--uri').Split('?')[0]
    if (($id -ieq $s.OldAcsId -and -not $f.moved) -or ($id -ieq $s.TargetAcsId -and $f.moved)) {
      return @{ id = $id; location = 'global'; tags = @{ 'acme:application' = 'acme-los' }; properties = @{ immutableResourceId = $s.AcsImmutableId; hostName = $s.AcsHostName; dataLocation = 'United States'; disableLocalAuth = $true } } | ConvertTo-Json -Depth 8
    }
    return Missing-Resource
  }
  if ($cmd -like 'rest --method get *ContainerRegistry*') {
    return @{ location = 'eastus'; tags = @{ 'acme:application' = 'acme-los' }; properties = @{ adminUserEnabled = $false } } | ConvertTo-Json -Depth 8
  }
  if ($cmd -like 'resource move *') {
    if ($f.fail -eq 'move') { $global:LASTEXITCODE = 1; return 'ERROR: synthetic move failure' }
    $f.moved = $true
    if ($f.fail -eq 'move-response') { $global:LASTEXITCODE = 1; return 'ERROR: synthetic response failure after completed move' }
    return
  }
  throw "Unexpected Azure command: $cmd"
}
function Invoke-Prepare { & $entrypoint -Action prepare -Apply -ConfirmWorkload acme-los-dev-centralus-to-eastus }
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Assert-Fails([scriptblock]$Body) { try { & $Body | Out-Null } catch { return }; throw 'Expected failure' }
try {
  Reset-Fixture
  Invoke-Prepare
  $f = $global:rebuildFixture
  Assert-True ($f.moved -and -not $f.oldStack -and $f.imported.Count -eq 2) 'first prepare copies both images and moves the existing ACS'
  Assert-True ($f.calls.IndexOf('validate ACS move') -lt $f.calls.FindIndex([Predicate[string]]{ param($x) $x -like 'stack group delete *' })) 'validation precedes detachment'
  $f.calls.Clear()
  Invoke-Prepare
  Assert-True (@($f.calls | Where-Object { $_ -like 'acr import *' -or $_ -like 'resource move *' -or $_ -like 'stack group delete *' }).Count -eq 0) 'retry does not reimport, detach, or move'
  foreach ($failure in @('validation', 'target-stack')) {
    Reset-Fixture; $global:rebuildFixture.fail = $failure
    Assert-Fails { Invoke-Prepare }
    Assert-True (@($global:rebuildFixture.calls | Where-Object { $_ -match ' create | delete | move --| import ' }).Count -eq 0) 'failed preflight performs zero mutations'
    Assert-True ($global:rebuildFixture.oldStack -and -not $global:rebuildFixture.moved) 'old ownership preserved'
  }
  foreach ($failure in @('move', 'move-response')) {
    Reset-Fixture; $global:rebuildFixture.fail = $failure
    Assert-Fails { Invoke-Prepare }
    Assert-True (-not $global:rebuildFixture.oldStack) 'interrupted attempt detached ownership only after preflight'
    $global:rebuildFixture.fail = ''; $global:rebuildFixture.calls.Clear()
    Invoke-Prepare
    Assert-True $global:rebuildFixture.moved 'retry preserves ACS continuity and completes'
    Assert-True (@($global:rebuildFixture.calls | Where-Object { $_ -like 'acr import *' -or $_ -like 'stack group delete *' }).Count -eq 0) 'interrupted retry reuses copied images and detached state'
  }
  Write-Host 'Full rebuild prepare success, idempotency, zero-mutation preflights, and interrupted move retries passed.'
} finally {
  Remove-Item Function:\global:az, Function:\global:node, Function:\global:Invoke-WebRequest -ErrorAction SilentlyContinue
}
