[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$Environments,

  [string]$Owner = 'vc4u2c',
  [string]$Repo = 'acme-los',
  [string]$RequiredReviewerUser = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-GhPath {
  $localGh = Join-Path $PSScriptRoot '..\..\.tools\bin\gh.exe'
  $resolvedLocalGh = [System.IO.Path]::GetFullPath($localGh)
  if (Test-Path $resolvedLocalGh) {
    return $resolvedLocalGh
  }

  $command = Get-Command gh -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  throw 'GitHub CLI was not found. Install gh or place a portable binary at .tools\bin\gh.exe.'
}

function Invoke-Gh {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $script:GhExe @Arguments
}

function Get-RequiredReviewer {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Username
  )

  $json = Invoke-Gh @(
    'api',
    '-H', 'Accept: application/vnd.github+json',
    "users/$Username"
  )

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to resolve GitHub user '$Username'."
  }

  $user = $json | ConvertFrom-Json
  return @{
    type = 'User'
    id   = [int]$user.id
  }
}

function Ensure-GhAuth {
  Invoke-Gh @('auth', 'status') *> $null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Write-Host 'GitHub CLI is not authenticated. Starting gh auth login...' -ForegroundColor Yellow
  Invoke-Gh @('auth', 'login')

  Invoke-Gh @('auth', 'status') *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI authentication did not complete successfully.'
  }
}

$script:GhExe = Get-GhPath
Ensure-GhAuth

$reviewers = @()
if (-not [string]::IsNullOrWhiteSpace($RequiredReviewerUser)) {
  $reviewers += Get-RequiredReviewer -Username $RequiredReviewerUser
}

Write-Host "Using GitHub CLI at: $script:GhExe"
Write-Host "Target repository: $Owner/$Repo"

foreach ($environment in $Environments) {
  Write-Host "Creating or updating environment '$environment'..." -ForegroundColor Cyan
  $payload = @{}

  if ($reviewers.Count -gt 0 -and $environment -ne 'dev') {
    $payload.reviewers = $reviewers
  }

  $payloadFile = Join-Path ([System.IO.Path]::GetTempPath()) ("acme-los-github-environment-{0}.json" -f [guid]::NewGuid())
  $payloadJson = $payload | ConvertTo-Json -Depth 5 -Compress
  [System.IO.File]::WriteAllText(
    $payloadFile,
    $payloadJson,
    [System.Text.UTF8Encoding]::new($false)
  )

  try {
    Invoke-Gh @(
      'api',
      '--method', 'PUT',
      '-H', 'Accept: application/vnd.github+json',
      '-H', 'X-GitHub-Api-Version: 2022-11-28',
      "repos/$Owner/$Repo/environments/$environment",
      '--input', $payloadFile
    )

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to create or update environment '$environment'."
    }
  }
  finally {
    if (Test-Path $payloadFile) {
      Remove-Item -Path $payloadFile -Force
    }
  }
}

Write-Host 'Environment setup complete.' -ForegroundColor Green
