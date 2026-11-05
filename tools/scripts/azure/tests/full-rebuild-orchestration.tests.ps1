# Run the actual entrypoint with native boundaries mocked, including DNS. No Azure/network access.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$entrypoint = Join-Path $PSScriptRoot '../invoke-full-regional-rebuild.ps1'
$global:fullRebuildCalls = [Collections.Generic.List[string]]::new()
$global:fullRebuildUnknownResource = $false
function global:node {
  $global:LASTEXITCODE = 0
  return '{"zone":"los.avanai.net","nameServers":["ns1.example.test.","ns2.example.test.","ns3.example.test.","ns4.example.test."]}'
}
function global:az {
  $a = [string[]]$args
  $command = $a -join ' '
  $global:fullRebuildCalls.Add($command)
  $global:LASTEXITCODE = 0
  if ($command -like 'account show *') {
    $sub = $a[[array]::IndexOf($a, '--subscription') + 1]
    return @{ id = $sub; tenantId = '73521cbe-9858-4230-996d-319b8074e103'; state = 'Enabled' } | ConvertTo-Json
  }
  if ($command -like 'rest --method get *dnsZones/los.avanai.net*') {
    return @{ id = '/subscriptions/b582269b-60ff-4bb0-b30b-6fb2796edf11/resourceGroups/rg-acme-los-dns-cus-01/providers/Microsoft.Network/dnsZones/los.avanai.net'; tags = @{ acmeApplication = 'acme-los'; acmeLifecycle = 'retain' }; properties = @{ zoneType = 'Public'; nameServers = @('ns1.example.test.', 'ns2.example.test.', 'ns3.example.test.', 'ns4.example.test.') } } | ConvertTo-Json -Depth 8
  }
  if ($command -like 'resource list *') {
    if ($global:fullRebuildUnknownResource) { return '[{"id":"/subscriptions/unrelated/resourceGroups/do-not-delete"}]' }
    return '[]'
  }
  throw "Unexpected command in read-only test: $command"
}
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Assert-Fails([scriptblock]$Body, [string]$Pattern) {
  try { & $Body | Out-Null } catch { Assert-True ($_.Exception.Message -match $Pattern) "Expected $Pattern, received $($_.Exception.Message)"; return }
  throw "Expected failure: $Pattern"
}
try {
  $plan = & $entrypoint | ConvertFrom-Json
  Assert-True ($plan.from -ceq 'centralus' -and $plan.to -ceq 'eastus') 'default action is read-only plan'
  Assert-True ($global:fullRebuildCalls.Count -eq 5) 'only two accounts, public zone, and two old inventories read'
  Assert-True ($plan.preserve -contains 'other applications') 'other apps excluded'
  foreach ($action in @('prepare', 'cleanup')) {
    $global:fullRebuildCalls.Clear()
    Assert-Fails { & $entrypoint -Action $action } 'Mutations require'
    Assert-Fails { & $entrypoint -Action $action -Apply -ConfirmWorkload 'other' } 'Mutations require'
    Assert-True ($global:fullRebuildCalls.Count -eq 0) 'unconfirmed operation makes no Azure calls'
  }
  $global:fullRebuildUnknownResource = $true
  Assert-Fails { & $entrypoint -Action prepare -Apply -ConfirmWorkload 'acme-los-dev-centralus-to-eastus' } 'Unexpected resource'
  Assert-True (@($global:fullRebuildCalls | Where-Object { $_ -match ' create | delete | move | import ' }).Count -eq 0) 'unreviewed inventory blocks all mutations'
  Write-Host 'Full rebuild entrypoint: default plan, confirmations, and foreign-resource rejection passed.'
} finally {
  Remove-Item Function:\global:az, Function:\global:node -ErrorAction SilentlyContinue
}
