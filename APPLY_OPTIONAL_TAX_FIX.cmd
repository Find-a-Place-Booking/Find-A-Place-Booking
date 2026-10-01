@echo off
setlocal
cd /d "%~dp0"
echo Applying Find A Place optional tax source changes...
node scripts\apply-optional-tax-fix.mjs
if errorlevel 1 (
  echo.
  echo Patch failed. No database changes were made by this script.
  pause
  exit /b 1
)
echo.
echo Source patch complete.
echo.
echo IMPORTANT:
echo Run supabase\migrations\20261001150000_optional_host_tax_checkout.sql
echo against the Find A Place Supabase project, then run:
echo   npm run typecheck
echo   npm run build
echo.
pause
