@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 apply_overlay.py .
) else (
  python apply_overlay.py .
)
if errorlevel 1 (
  echo.
  echo Patch did not apply. No existing files were changed.
  pause
  exit /b 1
)
echo.
echo Finished. Run npm run typecheck and npm run build, then commit/push.
pause
