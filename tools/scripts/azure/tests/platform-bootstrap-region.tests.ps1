Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$global:bootstrapFixture = @{ groups = @{}; calls = [Collections.Generic.List[string]]::new(); failStage = '' }
function az {
  $a = [string[]]$args; $cmd = $a -join ' '; $f = $global:bootstrapFixture; $f.calls.Add($cmd)
  $global:LASTEXITCODE = 0
  $template = $a[[array]::IndexOf($a, '--template-file') + 1]
  if ($template -like '*main.hub.sub.bicep') {
    if ($f.failStage -eq 'hub') { $global:LASTEXITCODE = 1; return '{}' }
    if ($a -notcontains 'location=centralus' -or $a -notcontains 'regionShortName=cus') { throw 'Retained hub must not inherit the workload region.' }
    $outputs = @{}
    foreach ($kind in @('edge', 'monitor', 'network')) {
      $name = "rg-acme-hub-$kind-cus-01"
      if ($f.groups.ContainsKey($name) -and $f.groups[$name] -ne 'centralus') { throw 'Attempted RG relocation.' }
      $f.groups[$name] = 'centralus'; $outputs["$($kind)ResourceGroupName"] = @{ value = $name }
    }
    return @{ properties = @{ outputs = $outputs } } | ConvertTo-Json -Depth 8
  }
  if ($template -like '*main.web.monitoring.sub.bicep') {
    if ($f.failStage -eq 'monitor') { $global:LASTEXITCODE = 1; return }
    if ($a -notcontains 'location=eastus' -or $a -notcontains 'regionShortName=eus') { throw 'Regional monitoring must use the workload region.' }
    if ($f.groups.ContainsKey('rg-acme-hub-monitor-eus-01') -and $f.groups['rg-acme-hub-monitor-eus-01'] -ne 'eastus') { throw 'Attempted monitoring RG relocation.' }
    $f.groups['rg-acme-hub-monitor-eus-01'] = 'eastus'; return
  }
  if ($template -like '*main.platform.network.rg.bicep') {
    $group = $a[[array]::IndexOf($a, '--resource-group') + 1]
    if ($group -ne 'rg-acme-hub-network-cus-01' -or -not $f.groups.ContainsKey($group)) { throw 'DNS group was not scaffolded.' }
    return '{"properties":{"outputs":{"keyVaultPrivateDnsZoneName":{"value":"privatelink.vaultcore.azure.net"},"managedRedisPrivateDnsZoneName":{"value":"privatelink.redis.azure.net"}}}}'
  }
  throw "Unexpected Azure call: $cmd"
}
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Invoke-Bootstrap { & (Join-Path $PSScriptRoot '../deploy-platform-network.ps1') -SubscriptionId 'synthetic-platform' }
try {
  foreach ($phase in @('fresh', 'repeat')) {
    $result = Invoke-Bootstrap | ConvertFrom-Json
    Assert-True ($result.networkResourceGroupName -ceq 'rg-acme-hub-network-cus-01') "$phase preserves DNS group"
    Assert-True ($result.monitorResourceGroupName -ceq 'rg-acme-hub-monitor-eus-01') "$phase reports regional monitoring"
    Assert-True ($global:bootstrapFixture.groups.Count -eq 4) "$phase does not create a replacement DNS hub"
  }
  foreach ($stage in @('hub', 'monitor')) {
    $global:bootstrapFixture.failStage = $stage; $global:bootstrapFixture.calls.Clear(); $caught = $false
    try { Invoke-Bootstrap | Out-Null } catch { $caught = $true }
    Assert-True $caught 'Failed scaffold must stop bootstrap.'
    Assert-True (@($global:bootstrapFixture.calls | Where-Object { $_ -like '*main.platform.network.rg.bicep*' }).Count -eq 0) 'DNS unchanged after scaffold failure.'
  }
  $global:bootstrapFixture.calls.Clear(); $caught = $false
  try { & (Join-Path $PSScriptRoot '../deploy-platform-network.ps1') -SubscriptionId 'synthetic-platform' -Location eastus | Out-Null } catch { $caught = $true }
  Assert-True ($caught -and $global:bootstrapFixture.calls.Count -eq 0) 'Mismatched explicit location rejected before mutations.'
  $global:LASTEXITCODE = 0
  Write-Host 'Platform bootstrap fresh/repeat region placement and failed-scaffold safety tests passed.'
} finally { Remove-Item Function:\az -ErrorAction SilentlyContinue }
