@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 apply_overlay.py .
) else (
  python apply_overlay.py .
)
if errorlevel 1 (
  echo.
  echo Overlay did not finish. Nothing was deployed.
  pause
  exit /b 1
)
echo.
echo Next: npm run typecheck ^&^& npm run build
pause
