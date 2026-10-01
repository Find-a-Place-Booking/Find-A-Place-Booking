@echo off
setlocal
cd /d "%~dp0"

echo Installing the clickable calendar day UI...
node scripts\apply-calendar-day-click-fix.mjs

if errorlevel 1 (
  echo.
  echo Fix failed and the calendar page was restored.
  pause
  exit /b 1
)

echo.
echo Done. Now run:
echo   npm run typecheck
echo   npm run build
echo.
echo No Supabase migration is required.
pause
