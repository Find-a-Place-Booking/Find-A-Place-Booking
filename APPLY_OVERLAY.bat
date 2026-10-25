@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 apply_special_offer_overlay.py .
) else (
  python apply_special_offer_overlay.py .
)
if errorlevel 1 (
  echo ERROR: The existing pages were not modified. Send the error to support.
  pause
  exit /b 1
)
echo.
echo Next: npm run typecheck ^&^& npm run build
pause
