param(
  [Parameter(Position=0)]
  [string]$Target = "."
)

$ErrorActionPreference = "Stop"
$Script = Join-Path $PSScriptRoot "apply-contact-social-pass.mjs"
node $Script $Target
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
