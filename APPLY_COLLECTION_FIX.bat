@echo off
cd /d "%~dp0"
python APPLY_COLLECTION_FIX.py
if errorlevel 1 (
 echo Could not safely apply collection filters. See error above.
 pause
 exit /b 1
)
echo Filters applied. Run npm run build, then commit and push.
pause
