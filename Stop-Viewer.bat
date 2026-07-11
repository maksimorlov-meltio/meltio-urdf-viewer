@echo off
REM Stops the viewer (:8090) and slicer (:8765) servers started by Start-Viewer.
title Stop Meltio Viewer
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = Get-NetTCPConnection -State Listen -LocalPort 8090,8765 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique;" ^
  "if (-not $ids) { Write-Host 'Nothing running on :8090 / :8765.' -ForegroundColor DarkGray }" ^
  "else { foreach ($id in $ids) { try { Stop-Process -Id $id -Force -ErrorAction Stop; Write-Host \"Stopped PID $id\" -ForegroundColor Green } catch {} } }"
timeout /t 2 >nul
