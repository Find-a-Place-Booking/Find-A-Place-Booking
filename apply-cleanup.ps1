$ErrorActionPreference = "Stop"

Write-Host "Removing retired sandbox-only booking code..." -ForegroundColor Cyan

$paths = @(
  "app/api/booking/sandbox",
  "components/SandboxGuestCheckout.tsx",
  "components/SandboxGuestCheckout.module.css",
  "components/SandboxBookingConfirmation.tsx",
  "lib/payments/sandbox-booking.ts",
  "lib/payments/stripe-guest.ts"
)

foreach ($path in $paths) {
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
    Write-Host "Removed: $path"
  }
}

$leftovers = @()
foreach ($path in $paths) {
  if (Test-Path $path) { $leftovers += $path }
}

if ($leftovers.Count -gt 0) {
  Write-Host "Cleanup FAILED. These paths still exist:" -ForegroundColor Red
  $leftovers | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Sandbox-only booking files are gone." -ForegroundColor Green
Write-Host "Next:"
Write-Host "  npm install stripe@22.4.0"
Write-Host "  npm run typecheck"
Write-Host "  npm run build"
Write-Host "Build output must NOT contain /api/booking/sandbox/*"
