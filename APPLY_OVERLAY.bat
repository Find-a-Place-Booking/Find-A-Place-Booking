@echo off
cd /d "%~dp0"
python apply_overlay.py .
if errorlevel 1 (
 echo Overlay could not be connected. No files written.
 pause
 exit /b 1
)
echo Run npm run typecheck and npm run build before pushing.
pause
