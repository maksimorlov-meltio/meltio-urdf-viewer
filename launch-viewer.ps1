<#
  One-click launcher for the Meltio URDF viewer + embedded slicer.

  You don't run this directly -- double-click Start-Viewer.bat, which calls it.
  It will:
    1. Start the slicer backend on http://127.0.0.1:8765  (venv311)   if not already up
    2. Start the avisualizer viewer on http://127.0.0.1:8090 (.venv)  if not already up
    3. Wait until both answer, then open the viewer MAXIMIZED in your browser,
       with a fresh cache-bust so you always see the latest CSS/JS.

  The two servers keep running in their own minimized windows so the app stays
  live after this launcher finishes. Run Stop-Viewer.bat to shut them down.
#>
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

# --- Paths (all relative to this repo folder, so the launcher is portable) ---
$SlicerSrc = Join-Path $Root "_slicer_branch\projects\platform\src"
$AvisSrc   = Join-Path $Root "apps\dev-host\src"
$PyViewer  = Join-Path $Root ".venv\Scripts\python.exe"      # viewer venv
$PySlicer  = Join-Path $Root "venv311\Scripts\python.exe"    # slicer venv (Py 3.11)

$SlicerUrl = "http://127.0.0.1:8765"
$ViewerUrl = "http://127.0.0.1:8090/urdf"

# --- Env wiring (child processes inherit this) -------------------------------
# Both Python packages share PYTHONPATH (distinct top-level names, no clash).
# AVIS_SLICER_URL points the viewer at the slicer so the Files-menu slice and
# the in-scene print simulation work end to end.
$env:PYTHONPATH         = "$SlicerSrc;$AvisSrc"
$env:AVIS_SLICER_URL    = $SlicerUrl
$env:AVIS_SLICER_UI_URL = $SlicerUrl

function Test-Up($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Wait-Up($url, $name, $timeoutSec = 45) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Up $url) { Write-Host "  $name is up." -ForegroundColor Green; return $true }
    Start-Sleep -Milliseconds 600
  }
  Write-Host "  $name did not answer within $timeoutSec s (opening anyway)." -ForegroundColor Yellow
  return $false
}

Write-Host ""
Write-Host "=== Meltio Viewer launcher ===" -ForegroundColor Cyan

# --- 1) Slicer backend -------------------------------------------------------
if (Test-Up "$SlicerUrl/api/health") {
  Write-Host "Slicer already running on :8765." -ForegroundColor DarkGray
} else {
  if (-not (Test-Path $PySlicer)) {
    Write-Host "ERROR: slicer Python not found at $PySlicer" -ForegroundColor Red
    Read-Host "Press Enter to exit"; exit 1
  }
  Write-Host "Starting slicer backend on :8765 ..."
  Start-Process -FilePath $PySlicer -ArgumentList @(
    "-m","uvicorn","meltio_platform.slicer.web.app:create_app",
    "--factory","--host","127.0.0.1","--port","8765"
  ) -WorkingDirectory $Root -WindowStyle Minimized | Out-Null
  Wait-Up "$SlicerUrl/api/health" "Slicer" | Out-Null
}

# --- 2) Viewer ---------------------------------------------------------------
if (Test-Up $ViewerUrl) {
  Write-Host "Viewer already running on :8090." -ForegroundColor DarkGray
} else {
  if (-not (Test-Path $PyViewer)) {
    Write-Host "ERROR: viewer Python not found at $PyViewer" -ForegroundColor Red
    Read-Host "Press Enter to exit"; exit 1
  }
  Write-Host "Starting viewer on :8090 ..."
  Start-Process -FilePath $PyViewer -ArgumentList @(
    "-m","uvicorn","avisualizer.web.app:create_app",
    "--factory","--host","127.0.0.1","--port","8090"
  ) -WorkingDirectory $Root -WindowStyle Minimized | Out-Null
  Wait-Up $ViewerUrl "Viewer" | Out-Null
}

# --- 3) Open the browser, maximized, with a fresh cache-bust -----------------
$cb      = Get-Date -Format "yyyyMMddHHmmss"
$openUrl = "$ViewerUrl`?cb=$cb"

# Prefer a Chromium browser so we can force a clean, maximized window. A
# dedicated user-data-dir makes --start-maximized reliable (a brand-new window
# honours it) and keeps this app separate from your normal browsing profile.
$browser = $null
foreach ($c in @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )) { if (Test-Path $c) { $browser = $c; break } }

Write-Host "Opening $openUrl (maximized) ..." -ForegroundColor Cyan
if ($browser) {
  $profileDir = Join-Path $env:LOCALAPPDATA "MeltioViewer\browser"
  & $browser `
    "--user-data-dir=$profileDir" `
    "--new-window" "--start-maximized" `
    "--no-first-run" "--no-default-browser-check" `
    $openUrl
} else {
  # No Chromium found -> fall back to the default browser (won't be maximized).
  Start-Process $openUrl
}

Write-Host ""
Write-Host "Ready. The slicer + viewer keep running in minimized windows." -ForegroundColor Green
Write-Host "Run Stop-Viewer.bat when you want to shut them down." -ForegroundColor Green
Start-Sleep -Seconds 2
