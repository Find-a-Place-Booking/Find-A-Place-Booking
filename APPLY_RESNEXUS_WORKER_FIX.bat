@echo off
cd /d "%~dp0"
py -3 APPLY_RESNEXUS_WORKER_FIX.py
if errorlevel 1 (
  echo.
  echo PATCH NOT APPLIED. Please read the error above.
  pause
  exit /b 1
)
echo.
echo Patch finished. Run worker tests and build before pushing.
pause
