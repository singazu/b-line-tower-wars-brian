@echo off
setlocal
cd /d "%~dp0"

echo Starting Brian Line Tower Wars...
echo.
echo preview.ps1 will try ports starting at 5510.
echo Use the exact URL printed in the server output.
echo.

powershell -ExecutionPolicy Bypass -File ".\preview.ps1" -Port 5510

if errorlevel 1 (
  echo.
  echo Failed to start server. Press any key to close.
  pause > nul
)
