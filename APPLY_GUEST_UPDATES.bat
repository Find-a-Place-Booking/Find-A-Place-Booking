@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 APPLY_IMMEDIATE_PRICES.py
) else (
  python APPLY_IMMEDIATE_PRICES.py
)
if errorlevel 1 (
  echo.
  echo Update could not complete. Keep the error shown above and do not deploy a partial update.
)
pause
