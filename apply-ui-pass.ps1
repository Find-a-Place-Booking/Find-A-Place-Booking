param(
  [Parameter(Mandatory=$false)]
  [string]$Target = "."
)

$Overlay = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $Target "package.json")) -or
    -not (Test-Path (Join-Path $Target "app")) -or
    -not (Test-Path (Join-Path $Target "components"))) {
  Write-Error "Target does not look like the Find A Place Booking repository: $Target"
  exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $Target "public\brand") | Out-Null
Copy-Item -Recurse -Force (Join-Path $Overlay "app\*") (Join-Path $Target "app")
Copy-Item -Recurse -Force (Join-Path $Overlay "components\*") (Join-Path $Target "components")
Copy-Item -Recurse -Force (Join-Path $Overlay "public\brand\*") (Join-Path $Target "public\brand")

Write-Host "Find A Place UI pass applied to: $Target"
Write-Host "Review 'git diff', then run your normal build/test commands before committing."
