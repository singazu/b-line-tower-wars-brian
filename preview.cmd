@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\preview.ps1"
if errorlevel 1 (
  echo.
  echo Preview failed. Press any key to close this window.
  pause > nul
)
