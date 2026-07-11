@echo off
REM One-click launcher for the Meltio URDF viewer + slicer.
REM Double-click this file. It starts both servers (if not already running)
REM and opens the viewer maximized in your browser.
title Meltio Viewer launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-viewer.ps1"
