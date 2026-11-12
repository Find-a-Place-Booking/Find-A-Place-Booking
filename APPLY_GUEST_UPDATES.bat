@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
  py -3 APPLY_GUEST_UPDATES.py
) else (
  python APPLY_GUEST_UPDATES.py
)
if errorlevel 1 (
  echo.
  echo Update could not be applied. No additional source edits were made by the updater.
  echo Confirm Python 3 is installed and retry, or contact the developer.
  pause
  exit /b 1
)
echo.
echo Source updates applied. Run npm run typecheck and npm run build before pushing.
pause
