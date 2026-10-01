@echo off
setlocal
cd /d "%~dp0"
echo Applying ResNexus login fix...
node scripts\apply-resnexus-login-fix.mjs
if errorlevel 1 (
  echo.
  echo Patch failed. Nothing was deployed.
  pause
  exit /b 1
)

echo.
echo Checking worker JavaScript syntax...
node --check resnexus-worker\src\resnexus.mjs
if errorlevel 1 (
  echo.
  echo Syntax check failed. Do not deploy this version.
  pause
  exit /b 1
)

echo.
echo Fix applied and syntax check passed.
echo Commit/push this project so Railway redeploys the ResNexus worker.
echo After Railway is live, use Retry on Renea's ResNexus connection.
echo.
pause
