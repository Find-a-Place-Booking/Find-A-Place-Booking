@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 APPLY_DIRECT_COMPARISON.py
) else (
  python APPLY_DIRECT_COMPARISON.py
)
if errorlevel 1 (
  echo.
  echo Fix NOT applied. Please review the error message above.
  pause
  exit /b 1
)
echo.
echo Comparison routing checked. Run npm run build before pushing.
pause
