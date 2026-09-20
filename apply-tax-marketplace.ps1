param(
  [string]$Target = "C:\Users\jlccu\find-a-place-booking-production-step-1"
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Patch-File {
  param(
    [string]$RelativePath,
    [array]$Replacements
  )

  $path = Join-Path $Target $RelativePath
  if (-not (Test-Path $path)) {
    throw "Missing expected file: $RelativePath"
  }

  $raw = [System.IO.File]::ReadAllText($path)
  $hadCrLf = $raw.Contains("`r`n")
  $text = $raw.Replace("`r`n", "`n")

  foreach ($replacement in $Replacements) {
    $old = [string]$replacement[0]
    $new = [string]$replacement[1]

    if (-not $text.Contains($old)) {
      throw "Patch guard failed in $RelativePath. Expected production snippet was not found. No guesswork was applied."
    }

    $text = $text.Replace($old, $new)
  }

  if ($hadCrLf) {
    $text = $text.Replace("`n", "`r`n")
  }

  Write-Utf8NoBom $path $text
  Write-Host "patched $RelativePath" -ForegroundColor Green
}

if (-not (Test-Path $Target)) {
  throw "Target repo not found: $Target"
}

$head = (& git -C $Target rev-parse HEAD 2>$null).Trim()
if (-not $head) {
  throw "Target is not a readable git repository."
}

Write-Host "Find A Place tax patch" -ForegroundColor Cyan
Write-Host "repo: $Target"
Write-Host "HEAD: $head"

if ($head -ne "6f172dc66dcf255c47f19a2be812e114b6901343") {
  Write-Warning "This package was built against 6f172dc66dcf255c47f19a2be812e114b6901343. Patch guards will still prevent blind replacements."
}

# New tax migration and admin files.
$migrationDir = Join-Path $Target "supabase\migrations"
$taxAdminDir = Join-Path $Target "app\admin\taxes"
New-Item -ItemType Directory -Force -Path $migrationDir | Out-Null
New-Item -ItemType Directory -Force -Path $taxAdminDir | Out-Null

Copy-Item -Force (Join-Path $PSScriptRoot "supabase\migrations\20260918004100_marketplace_lodging_tax.sql") (Join-Path $migrationDir "20260918004100_marketplace_lodging_tax.sql")
Copy-Item -Force (Join-Path $PSScriptRoot "app\admin\taxes\page.tsx") (Join-Path $taxAdminDir "page.tsx")
Copy-Item -Force (Join-Path $PSScriptRoot "app\admin\taxes\actions.ts") (Join-Path $taxAdminDir "actions.ts")
Write-Host "added tax migration + admin tax console" -ForegroundColor Green

$holdResultTypeOld = @'
      guest_total_cents: number;
      platform_commission_cents: number;
      commission_rate_bps: number;
      quote?: unknown;
'@
$holdResultTypeNew = @'
      guest_total_cents: number;
      tax_total_cents: number;
      tax_status: string;
      platform_tax_retained_cents: number;
      platform_commission_cents: number;
      commission_rate_bps: number;
      quote?: unknown;
'@
$holdResponseOld = @'
      guestTotalCents: Number(result.guest_total_cents),
      platformCommissionCents: Number(result.platform_commission_cents),
'@
$holdResponseNew = @'
      guestTotalCents: Number(result.guest_total_cents),
      taxTotalCents: Number(result.tax_total_cents || 0),
      taxStatus: result.tax_status || "CALCULATED",
      platformTaxRetainedCents: Number(result.platform_tax_retained_cents || 0),
      platformCommissionCents: Number(result.platform_commission_cents),
'@

Patch-File "app\api\booking\hold\route.ts" @(
  @(
    'const { data, error } = await admin.rpc("create_guest_reservation_hold", {',
    'const { data, error } = await admin.rpc("create_guest_taxed_reservation_hold", {'
  ),
  @($holdResultTypeOld, $holdResultTypeNew),
  @($holdResponseOld, $holdResponseNew)
)

$holdTypeOld = @'
  guestTotalCents: number;
  platformCommissionCents: number;
  commissionRateBps: number;
};
'@
$holdTypeNew = @'
  guestTotalCents: number;
  taxTotalCents: number;
  platformCommissionCents: number;
  commissionRateBps: number;
};
'@
$statusTypeOld = @'
  guestTotalCents: number;
  platformCommissionCents: number;
};
'@
$statusTypeNew = @'
  guestTotalCents: number;
  taxTotalCents: number;
  platformCommissionCents: number;
};
'@
$resumedHoldOld = @'
          guestTotalCents: status.guestTotalCents,
          platformCommissionCents: status.platformCommissionCents,
          commissionRateBps: 0,
'@
$resumedHoldNew = @'
          guestTotalCents: status.guestTotalCents,
          taxTotalCents: status.taxTotalCents,
          platformCommissionCents: status.platformCommissionCents,
          commissionRateBps: 0,
'@
$summaryOld = @'
          {hold ? (
            <div className={styles.total}>
              <span>Total</span>
              <b>{money(hold.guestTotalCents)}</b>
            </div>
          ) : null}
'@
$summaryNew = @'
          {hold?.taxTotalCents ? (
            <div><span>Taxes</span><b>{money(hold.taxTotalCents)}</b></div>
          ) : null}

          {hold ? (
            <div className={styles.total}>
              <span>Total</span>
              <b>{money(hold.guestTotalCents)}</b>
            </div>
          ) : null}
'@

Patch-File "components\GuestCheckout.tsx" @(
  @($holdTypeOld, $holdTypeNew),
  @($statusTypeOld, $statusTypeNew),
  @($resumedHoldOld, $resumedHoldNew),
  @($summaryOld, $summaryNew)
)

$sidebarOld = @'
  { label: "Reservations", href: "/admin/reservations", key: "reservations" },
  {
    label: "Site content",
'@
$sidebarNew = @'
  { label: "Reservations", href: "/admin/reservations", key: "reservations" },
  {
    label: "Taxes",
    href: "/admin/taxes",
    key: "taxes",
    roles: ["SUPER_ADMIN", "FINANCE_ADMIN"],
  },
  {
    label: "Site content",
'@

Patch-File "components\AdminSidebar.tsx" @(
  @($sidebarOld, $sidebarNew)
)

$mobileNavOld = @'
  ["Reservations", "/admin/reservations", "reservations"],
  [
    "Site content",
'@
$mobileNavNew = @'
  ["Reservations", "/admin/reservations", "reservations"],
  [
    "Taxes",
    "/admin/taxes",
    "taxes",
    ["SUPER_ADMIN", "FINANCE_ADMIN"],
  ],
  [
    "Site content",
'@

Patch-File "components\AdminMobileNav.tsx" @(
  @($mobileNavOld, $mobileNavNew)
)

$paymentCommentOld = @'
    // We intentionally allow tax=0 while using Stripe TEST keys so the same
    // production path can be tested end-to-end. Live money is blocked until a
    // tax calculation has been snapshotted onto the reservation.
'@
$paymentCommentNew = @'
    // TEST and LIVE now use the same marketplace tax calculation path.
    // LIVE remains stricter: the property jurisdiction must be finance-verified
    // before the hold can be created and paid.
'@

Patch-File "app\api\booking\payment-intent\route.ts" @(
  @($paymentCommentOld, $paymentCommentNew)
)

$taxNoteOld = @'
<div><strong>Tax-safe</strong><span>Add-ons have a reserved tax-category field, but tax amounts stay unset until jurisdiction/provider logic is verified.</span></div>
'@
$taxNoteNew = @'
<div><strong>Tax-safe</strong><span>Find A Place calculates marketplace lodging tax after pricing resolves. Statewide rules apply by region; local rules only apply after the exact property jurisdiction is finance-verified.</span></div>
'@

Patch-File "app\host\rates\[slug]\page.tsx" @(
  @($taxNoteOld, $taxNoteNew)
)

Write-Host ""
Write-Host "Patch applied. Next run:" -ForegroundColor Cyan
Write-Host "  npm run typecheck"
Write-Host "  npm run build"
Write-Host ""
Write-Host "Then apply supabase/migrations/20260918004100_marketplace_lodging_tax.sql to Supabase before testing checkout." -ForegroundColor Yellow
Write-Host "Open /admin/taxes as SUPER_ADMIN or FINANCE_ADMIN, verify each property's locality, and assign its local rules before LIVE checkout." -ForegroundColor Yellow
