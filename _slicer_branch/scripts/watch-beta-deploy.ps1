<#
.SYNOPSIS
  Watch the latest deploy-beta.yml GitHub Actions run for a commit until it finishes.

.DESCRIPTION
  Resolves the most recent deploy-beta workflow run for a commit SHA (default: the
  current HEAD) and polls its status, printing a timestamped line each check, until
  it completes. Lives in scripts/ so it is covered by the auto-allowed
  PowerShell(.\scripts\*) permission (no approval prompt on each deploy watch).

.EXAMPLE
  .\scripts\watch-beta-deploy.ps1
  .\scripts\watch-beta-deploy.ps1 -Sha <commit> -MaxChecks 30
#>
param(
  [string]$Sha = "",
  [int]$MaxChecks = 24,
  [int]$IntervalSeconds = 18,
  [int]$InitialWaitSeconds = 20
)

$ErrorActionPreference = "Stop"
$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) { $gh = "gh" }

if (-not $Sha) { $Sha = (git rev-parse HEAD).Trim() }
Write-Output "Watching deploy-beta for $Sha"

Start-Sleep -Seconds $InitialWaitSeconds
$rid = & $gh run list --workflow=deploy-beta.yml --commit $Sha --limit 1 --json databaseId -q '.[0].databaseId'
if (-not $rid) {
  Write-Output "No deploy-beta run found yet for $Sha"
  exit 1
}

for ($i = 0; $i -lt $MaxChecks; $i++) {
  # ConvertFrom-Json (not a jq -q string) avoids PowerShell mangling embedded
  # quotes when calling the native gh.exe.
  $run = & $gh run view $rid --json status,conclusion | ConvertFrom-Json
  $concl = if ($run.conclusion) { $run.conclusion } else { "-" }
  Write-Output ("{0} {1}/{2}" -f ([DateTime]::Now.ToString('HH:mm:ss')), $run.status, $concl)
  if ($run.status -eq "completed") { break }
  Start-Sleep -Seconds $IntervalSeconds
}
