param(
  [string]$Target = "."
)

$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "apply-contact-styling-hotfix.mjs") $Target
