@echo off
setlocal
cd /d "%~dp0"
echo Applying Find A Place calendar UI refresh...
node scripts\apply-calendar-ui-refresh.mjs
if errorlevel 1 (
  echo.
  echo Patch failed. The calendar page was restored.
  pause
  exit /b 1
)
echo.
echo Calendar UI refresh applied.
echo Run:
echo   npm run typecheck
echo   npm run build
echo.
echo No Supabase migration is required.
pause
