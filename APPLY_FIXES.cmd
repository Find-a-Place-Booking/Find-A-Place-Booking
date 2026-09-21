@echo off
setlocal
cd /d "%~dp0"
echo Applying Find A Place pre-pilot cleanup...
echo.
node apply-prepilot-cleanup.mjs "%CD%"
if errorlevel 1 (
  echo.
  echo The cleanup stopped. Read the error above. A backup is created before any changed file is overwritten.
  pause
  exit /b 1
)
echo.
echo Cleanup, typecheck and production build completed.
pause
