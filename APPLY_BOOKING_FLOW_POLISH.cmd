@echo off
setlocal
cd /d "%~dp0"
echo Applying Find A Place booking-flow polish...
node scripts\apply-booking-flow-polish.mjs
if errorlevel 1 (
  echo.
  echo Patch failed. Nothing should be deployed until the error above is resolved.
  pause
  exit /b 1
)
echo.
echo Patch applied. Run:
echo   npm run typecheck
echo   npm run build
echo.
echo Then apply the included Supabase migration.
pause
