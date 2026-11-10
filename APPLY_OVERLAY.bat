@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    py -3 apply_overlay.py
) else (
    python apply_overlay.py
)
if ERRORLEVEL 1 (
    echo Overlay NOT applied. Read the error above.
    pause
    exit /b 1
)
echo.
echo Source patch complete. Check typecheck and build before pushing.
pause
