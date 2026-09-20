param(
  [string]$Target = "C:\Users\jlccu\find-a-place-booking-production-step-1"
)

$ErrorActionPreference = "Stop"

$path = Join-Path $Target "app\host\rates\[slug]\page.tsx"

if (-not [System.IO.File]::Exists($path)) {
  throw "Could not find literal route file: $path"
}

$raw = [System.IO.File]::ReadAllText($path)
$hadCrLf = $raw.Contains("`r`n")
$text = $raw.Replace("`r`n", "`n")

$old = '<div><strong>Tax-safe</strong><span>Add-ons have a reserved tax-category field, but tax amounts stay unset until jurisdiction/provider logic is verified.</span></div>'
$new = '<div><strong>Tax-safe</strong><span>Find A Place calculates marketplace lodging tax after pricing resolves. Statewide rules apply by region; local rules only apply after the exact property jurisdiction is finance-verified.</span></div>'

if ($text.Contains($new)) {
  Write-Host "Host rates tax copy is already updated. Nothing to do." -ForegroundColor Green
  exit 0
}

if (-not $text.Contains($old)) {
  throw "Expected tax note was not found. No blind replacement was made."
}

$text = $text.Replace($old, $new)

if ($hadCrLf) {
  $text = $text.Replace("`n", "`r`n")
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8)

Write-Host "Finished skipped host rates tax copy patch." -ForegroundColor Green
Write-Host ""
Write-Host "Verify with:" -ForegroundColor Cyan
Write-Host "  npm run typecheck"
Write-Host "  npm run build"
Write-Host ""
Write-Host "IMPORTANT: the database migration still must be applied to Supabase before checkout uses the new tax system." -ForegroundColor Yellow
