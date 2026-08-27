@echo off
setlocal
cd /d "%~dp0"
echo Installing AROFi PR #54 automatic verifier...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install_pr54_autoverifier_windows.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. Leave this window open and share only the final error block.
  pause
  exit /b 1
)
echo.
echo Automatic verification is installed. GitHub Desktop is not required.
pause
