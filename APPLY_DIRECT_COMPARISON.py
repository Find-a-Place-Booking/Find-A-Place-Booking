#!/usr/bin/env python3
"""Guarded, idempotent backend update for verified-vs-estimated guest comparisons.

Run from Find-A-Place-Booking repo root after extracting overlay.
Only touches app/api/booking/airbnb-comparison/route.ts and only when exact
expected anchors are present. No database or third-party writes are performed.
"""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "app/api/booking/airbnb-comparison/route.ts"
COLLECTOR = ROOT / "lib/bookings/airbnb-direct-pricing.ts"


def substitute(source: str, old: str, new: str, label: str) -> str:
    if new in source:
        return source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one source anchor, found {count}. No files were changed.")
    return source.replace(old, new, 1)


def change(source: str) -> str:
    source = substitute(
        source,
        '''function unavailable() {
  return NextResponse.json({ available: false }, { headers: NO_STORE });
}''',
        '''function unavailable() {
  return NextResponse.json({ available: false }, { headers: NO_STORE });
}

// A calendar link is proof of a matching listing, NOT a verified external price.
// Do not manufacture a direct comparison if the provider quote cannot be obtained.
function directUnavailable() {
  return NextResponse.json({ available: false, comparisonType: "DIRECT_UNAVAILABLE" }, { headers: NO_STORE });
}''',
        "direct unavailable helper",
    )

    source = substitute(
        source,
        '''    comparisonType: "VERIFIED",
    airbnbTotalCents: quote.total_cents,''',
        '''    comparisonType: "VERIFIED",
    comparisonTotalCents: quote.total_cents,
    airbnbTotalCents: quote.total_cents,''',
        "verified total alias",
    )
    source = substitute(
        source,
        '''        comparisonType: "ESTIMATED",
        airbnbTotalCents: model.airbnbEquivalentTotalCents,''',
        '''        comparisonType: "ESTIMATED",
        comparisonTotalCents: model.airbnbEquivalentTotalCents,
        airbnbTotalCents: model.airbnbEquivalentTotalCents,''',
        "estimated total alias",
    )
    source = substitute(
        source,
        '''        airbnbHostFeeAssumptionBps: TYPICAL_AIRBNB_HOST_FEE_BPS,''',
        '''        comparisonFeeAssumptionBps: TYPICAL_AIRBNB_HOST_FEE_BPS,
        airbnbHostFeeAssumptionBps: TYPICAL_AIRBNB_HOST_FEE_BPS,''',
        "estimated fee assumption alias",
    )

    source = substitute(
        source,
        '''    if (!listingId) return unavailable();''',
        '''    if (!listingId) return directUnavailable();''',
        "linked listing missing ID",
    )
    source = substitute(
        source,
        '''    if (cacheError) return unavailable();''',
        '''    if (cacheError) return directUnavailable();''',
        "linked quote cache read failure",
    )

    # A recently observed price is only 'verified' if it was acquired by one of
    # the exact-price collectors, not a manually-entered/unknown cache source.
    source = substitute(
        source,
        '''    if (isFresh && previous?.listing_id === listingId && previous.currency === USD &&
      previous.price_basis === "BEFORE_TAXES" && positiveCents(previous.total_cents)) {''',
        '''    if (isFresh && previous?.listing_id === listingId && previous.currency === USD &&
      previous.price_basis === "BEFORE_TAXES" && positiveCents(previous.total_cents) &&
      (previous.source === "DIRECT_PUBLIC_PAGE" || previous.source === "HOST_AUTHORIZED_FEED")) {''',
        "strict external quote source verification",
    )
    source = substitute(
        source,
        '''    // Existing DB throttles: 30 minute cooldown per dates/party combination,''',
        '''    // No price collector configured? Avoid unnecessary throttled requests.
    // A calendar feed alone cannot supply an accurate trip quote.
    if (!process.env.AIRBNB_PRICE_FEED_URL?.trim() &&
        process.env.AIRBNB_PUBLIC_PAGE_LOOKUP !== "true") return directUnavailable();

    // Existing DB throttles: 30 minute cooldown per dates/party combination,''',
        "skip provider quote lookup without authorized collector",
    )
    source = substitute(
        source,
        '''    if (claimError || claimed !== true) return unavailable();''',
        '''    if (claimError || claimed !== true) return directUnavailable();''',
        "linked provider lookup throttled",
    )
    source = substitute(
        source,
        '''    if (!quote) return unavailable();''',
        '''    if (!quote) return directUnavailable();''',
        "no genuine provider price found",
    )
    # A valid freshly obtained exact quote can be displayed even if caching
    # fails, while its cache failure is logged for operational troubleshooting.
    source = substitute(
        source,
        '''    if (saveError) return unavailable();''',
        '''    if (saveError) {
      console.warn("[direct booking comparison] unable to store verified quote", { code: saveError.code });
    }''',
        "verified quote cache failure",
    )
    return source


def update_external_collector(source: str) -> str:
    # Competitor terms restrict automated access; public-page collection must
    # be a deliberate, authorized choice, never an automatic production default.
    return substitute(
        source,
        '''  // Disable with AIRBNB_PUBLIC_PAGE_LOOKUP=false if collection is not authorized.
  if (process.env.AIRBNB_PUBLIC_PAGE_LOOKUP === "false") return null;''',
        '''  // Disabled by default. Only an expressly authorized collection may opt in.
  if (process.env.AIRBNB_PUBLIC_PAGE_LOOKUP !== "true") return null;''',
        "external public-page lookups require express authorization",
    )


def main() -> None:
    if not TARGET.exists() or not COLLECTOR.exists():
        sys.exit("Error: extract this overlay into the Find A Place repository root first.")
    original = TARGET.read_text(encoding="utf-8")
    collector_original = COLLECTOR.read_text(encoding="utf-8")
    try:
        updated = change(original)
        collector_updated = update_external_collector(collector_original)
    except RuntimeError as exc:
        sys.exit(f"Cannot apply comparison routing safely: {exc}")
    # Only begin writing after validating *both* files.
    if updated != original:
        TARGET.write_text(updated, encoding="utf-8")
        print(f"Updated: {TARGET.relative_to(ROOT)}")
    if collector_updated != collector_original:
        COLLECTOR.write_text(collector_updated, encoding="utf-8")
        print(f"Updated: {COLLECTOR.relative_to(ROOT)}")
    if updated == original and collector_updated == collector_original:
        print("Both files already updated; no changes needed.")
    print("Guest-facing component supplied as a direct replacement.")
    print("Run: npm run build and your normal tests before pushing.")

if __name__ == "__main__":
    main()
