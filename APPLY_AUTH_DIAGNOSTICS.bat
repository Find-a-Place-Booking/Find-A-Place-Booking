@echo off
setlocal
cd /d "%~dp0"
py -3 APPLY_AUTH_DIAGNOSTICS.py
if errorlevel 1 python APPLY_AUTH_DIAGNOSTICS.py
if errorlevel 1 (
  echo Fix NOT applied. Check the error above.
  pause
  exit /b 1
)
echo Patch completed. Run the verification commands above before pushing.
pause
