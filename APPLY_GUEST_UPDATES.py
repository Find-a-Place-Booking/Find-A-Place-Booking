#!/usr/bin/env python3
"""Apply exact, verified source edits after extracting the Find A Place overlay.

Only edits eight pre-existing TSX/TS/CSS files whose Git blob SHA matches the
GitHub/main snapshot audited for this overlay. Checks all replacements before
writing anything, so mismatched files are never half-patched.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys

EXPECTED = {
    "app/page.tsx": "5ce1acc869999256c136d0cdee80e5d2d082233d",
    "app/stays/page.tsx": "bac2d98a23695436f539dfceda6358c4514a3824",
    "components/StayResults.tsx": "44adfcb279435e9d559f30fe68b8b6df76572f1e",
    "components/webapp/GuestWebApp.tsx": "bf6586c1ac412cab38b25dcb9e8d1d025cbb11d2",
    "components/BookingCard.tsx": "215e0d307b25acc15efcaa06962b98b1480c2a14",
    "components/DirectBookingValue.tsx": "9f4a48c48ac07a578c36918937e466675d1a152c",
    "components/DirectBookingValue.module.css": "431a68c3d31062968531d309d2d88c12aa05a3bc",
    "app/api/booking/airbnb-comparison/route.ts": "d2e6a7a229b41e944f98eb5e3f9367d1dba871a0",
}


def blob_sha(raw: bytes) -> str:
    return hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()


def replace_one(source: str, old: str, new: str, path: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one safe match, found {count}: {old[:100]!r}")
    return source.replace(old, new, 1)


def patch_home(s: str) -> str:
    path = "app/page.tsx"
    s = replace_one(s,
        'import { getPublishedMapStays, getPublishedProperties } from "@/lib/public/listings";',
        'import { getPublishedMapStays, getPublishedProperties } from "@/lib/public/listings";\nimport { selectLaunchPartnerCabins } from "@/lib/public/featured-launch-cabins";',path)
    s = replace_one(s,
        '''  {
    label: "Group getaways",
    detail: "Cabins and homes with room for eight or more.",
    filter: "Sleeps 8+",
  },''',
        '''  {
    label: "Unique stays",
    detail: "Cabooses, treehouses, tiny homes and stays you don't see every day.",
    filter: "Unique stays",
  },
  {
    label: "Group getaways",
    detail: "Cabins and homes with room for eight or more.",
    filter: "Sleeps 8+",
  },''',path)
    s = replace_one(s,
        '''    label: "Under $150",
    detail: "Budget-friendly stays with nightly rates under $150.",
    filter: "Under $150",''',
        '''    label: "Budget Friendly",
    detail: "Good getaways with starting nightly rates under $150.",
    filter: "Budget Friendly",''',path)
    s = replace_one(s,'getPublishedProperties(14),','getPublishedProperties(100),',path)
    s = replace_one(s,
        '''  const featuredStay = published[0] ?? null;
  const primaryStays = published.slice(0, 8);
  const moreStays = published.slice(8, 14);''',
        '''  // Featured areas never fall back to ordinary/non-cabin inventory.
  // Eligibility is checked against published, launch-priority, VERIFIED host records.
  const featuredCabins = await selectLaunchPartnerCabins(published);
  const featuredStay = featuredCabins[0] ?? null;
  const primaryStays = featuredCabins.slice(0, 8);
  const moreStays = featuredCabins.slice(8, 14);''',path)
    return s


def patch_stays(s: str) -> str:
    path = "app/stays/page.tsx"
    s = replace_one(s,
        '  "Luxury stays": "Luxury cabins and premium stays",',
        '  "Luxury stays": "Premium stays from $300 per night",\n  "Unique stays": "Cabooses, treehouses and other one-of-a-kind stays",',path)
    s = replace_one(s,
        '  "Under $150": "Stays under $150",',
        '  "Budget Friendly": "Budget-friendly stays under $150",',path)
    s = replace_one(s,
        '''  // Old shared Unique stays URLs keep working, but open the new collection.
  const requestedFilter = params.filter === "Unique stays" ? "Luxury stays" : params.filter;''',
        '''  // Preserve original Unique stays links; old Under $150 URLs remain valid.
  const requestedFilter = params.filter === "Under $150" ? "Budget Friendly" : params.filter;''',path)
    return s


def patch_results(s: str) -> str:
    path = "components/StayResults.tsx"
    s = replace_one(s,
        'import { isLargeGroupStay, isLuxuryStay } from "@/lib/public/discovery-categories";',
        'import { isLargeGroupStay, isLuxuryStay, isUniqueStay } from "@/lib/public/discovery-categories";',path)
    s = replace_one(s,
        '''  "Luxury stays",
  "Sleeps 8+",''',
        '''  "Luxury stays",
  "Unique stays",
  "Sleeps 8+",''',path)
    s = replace_one(s,'  "Under $150",','  "Budget Friendly",',path)
    s = replace_one(s,
        '.map((filter) => filter === "Unique stays" ? "Luxury stays" : filter)',
        '.map((filter) => filter === "Under $150" ? "Budget Friendly" : filter)',path)
    s = replace_one(s,
        '''        if (filter === "Luxury stays") return isLuxuryStay(property);
        if (filter === "RV Site")''',
        '''        if (filter === "Luxury stays") return isLuxuryStay(property);
        if (filter === "Unique stays") return isUniqueStay(property);
        if (filter === "RV Site")''',path)
    s = replace_one(s,
        '        if (filter === "Under $150") return property.price < 150;',
        '        if (filter === "Budget Friendly") return property.price < 150;',path)
    return s


def patch_guest_app(s: str) -> str:
    path = "components/webapp/GuestWebApp.tsx"
    s = replace_one(s,
        'import { StayMap } from "./StayMap";',
        'import { StayMap } from "./StayMap";\nimport { StayPhotoStrip } from "@/components/StayPhotoStrip";',path)
    s = replace_one(s,
        '''            {detail.images[0] ? (
              <img
                className="card media"
                style={{ height: 230 }}
                src={detail.images[0]}
                alt={detail.name}
              />
            ) : null}''',
        '''            <StayPhotoStrip key={detail.slug} images={detail.images} propertyName={detail.name} />''',path)
    return s


def patch_booking_card(s: str) -> str:
    path = "components/BookingCard.tsx"
    s = replace_one(s,
        'import { AvailabilityDatePicker } from "@/components/AvailabilityDatePicker";',
        'import { AvailabilityDatePicker } from "@/components/AvailabilityDatePicker";\nimport { DirectBookingValue } from "@/components/DirectBookingValue";',path)
    s = replace_one(s,
        '''      <button
        className="button button-full"
        type="button"
        disabled={
          !checkIn ||''',
        '''      {/* The platform comparison accompanies the actual quote on this page.
          It never changes booking totals, taxes, or checkout eligibility. */}
      {estimate && checkIn && checkOut && ["valid", "fallback"].includes(dateVerification) ? (
        <DirectBookingValue
          compact
          unitId={unitId}
          checkIn={checkIn}
          checkOut={checkOut}
          guests={guests}
          currency={currency}
          receiptPreTaxTotalCents={Number(quote?.pre_tax_total_cents || 0) || undefined}
        />
      ) : null}

      <button
        className="button button-full"
        type="button"
        disabled={
          !checkIn ||''',path)
    return s


def patch_comparison_ui(s: str) -> str:
    path = "components/DirectBookingValue.tsx"
    old = '''  const headline = isEstimated
    ? lowerHere
      ? `About ${money(difference)} below our estimate`
      : "Airbnb-style fee comparison"
    : lowerHere
      ? `Save ${money(difference)} booking direct`
      : difference < 0
        ? `Airbnb is ${money(-difference)} less for these dates`
        : "Both options have the same pre-tax total";
  const subhead = isEstimated
    ? "Modeled against a similar stay, before taxes."
    : "The same listing, dates and guests, before taxes.";'''
    new = '''  const headline = isEstimated
    ? lowerHere
      ? `You could save about ${money(difference)}`
      : "Compare your booking options"
    : lowerHere
      ? `Save ${money(difference)} booking here`
      : difference < 0
        ? "Compare booking totals before you decide"
        : "A comparable pre-tax price";
  const subhead = isEstimated
    ? "Illustrative estimate for a comparable stay, before taxes — not a live quote."
    : "Price checked for the same listing, dates and guests, before taxes.";'''
    s = replace_one(s, old, new, path)
    s = replace_one(s,
        'aria-label={isEstimated ? "Estimated Airbnb-style booking comparison" : "Same-listing Airbnb price comparison"}',
        'aria-label={isEstimated ? "Estimated comparison with other booking platforms" : "Verified comparison with another booking platform"}',path)
    s = replace_one(s,'<p className={styles.kicker}>Booking comparison</p>','<p className={styles.kicker}>SEE WHAT YOU COULD SAVE WITH FIND A PLACE</p>',path)
    s = replace_one(s,
        '<span className={styles.airbnbWordmark} aria-hidden="true">Airbnb</span>',
        '<span className={styles.otherPlatform} aria-hidden="true">Other</span>',path)
    s = replace_one(s,
        '<strong>{isEstimated ? "Airbnb-style estimate" : "Airbnb"}</strong>',
        '<strong>Other booking platforms</strong>',path)
    s = replace_one(s,
        '<small>{isEstimated ? "Similar stay · modeled price" : "Same stay and dates"}</small>',
        '<small>{isEstimated ? "Comparable stay · illustrative model" : "Same stay and dates · checked price"}</small>',path)
    s = replace_one(s,
        '''              The modeled Airbnb amount includes an illustrative host-side Airbnb fee of {money(comparison.hostFeeComparison.modeledAirbnbHostFeeCents)}. This is not an additional Find A Place charge.''',
        '''              The illustrative comparison assumes a {money(comparison.hostFeeComparison.modeledAirbnbHostFeeCents)} host-side service fee on another platform. This is not a Find A Place charge or a quoted competitor fee.''',path)
    s = replace_one(s,
        '''              ? "This example assumes an equivalent stay and equal host proceeds with an illustrative 15.5% Airbnb host service fee. It is not an actual Airbnb price or guaranteed savings; host pricing and fees can differ."
              : `Comparison for ${checkIn} to ${checkOut}, ${guests} ${guests === 1 ? "guest" : "guests"}.${observed && !Number.isNaN(observed.getTime()) ? ` Airbnb price checked ${observed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.` : ""} Actual prices can change.`}''',
        '''              ? "This is an illustrative model using equivalent host proceeds and a 15.5% host-side service-fee assumption for other booking platforms. It is not an actual third-party price, and savings are not guaranteed."
              : `The other-platform price was checked for ${checkIn} to ${checkOut}, ${guests} ${guests === 1 ? "guest" : "guests"}.${observed && !Number.isNaN(observed.getTime()) ? ` Checked ${observed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.` : ""} Prices can change.`}''',path)
    s = replace_one(s,
        'Both amounts are before lodging taxes, pets, optional extras and promotions. Your final total appears in checkout before payment.',
        'Both comparison amounts are before taxes, pets, and optional extras. Find A Place may include an eligible host promotion; other-platform rates and promotions may differ. The full checkout total is shown before payment.',path)
    s = replace_one(s,
        '''          {!isEstimated && comparison.airbnbListingUrl ? (
            <a className={styles.external} href={comparison.airbnbListingUrl} target="_blank" rel="noopener noreferrer">
              View the same property on Airbnb
            </a>
          ) : null}''',
        '''          <p className={styles.explanation}>
            Estimated comparisons are informational and not third-party checkout quotes. Verify final prices before booking.
          </p>''',path)
    # No guest-visible references to a named competitor in this component.
    if 'Airbnb' in s and any(token in s for token in [">Airbnb<", '"Airbnb"', 'Airbnb-style']):
        raise RuntimeError("Guest comparison still contains visible platform branding")
    return s


def patch_comparison_styles(s: str) -> str:
    path = "components/DirectBookingValue.module.css"
    s = replace_one(s, '.airbnbWordmark {', '.otherPlatform {', path)
    s = replace_one(s,
        'font-weight: 800; letter-spacing: -.04em; color: #c45655;',
        'font-weight: 750; letter-spacing: 0; color: #5e6d65;', path)
    return s


def patch_comparison_route(s: str) -> str:
    path = "app/api/booking/airbnb-comparison/route.ts"
    # Never suppress a modeled estimate simply because the external-feed
    # calendar lookup failed; the guest checkout quote is still authoritative.
    s = replace_one(s,
        "    if (connectionError || quoteError) return unavailable();",
        "    if (quoteError) return unavailable();", path)
    # Preserve existing estimate logic exactly; use it as a fallback only when
    # no fresh, validated same-listing quote is available. Not a fake quote.
    left = s.index("    if (!connected) {\n      // A model for a comparable booking cost;")
    right = s.index("    // A connected Airbnb calendar identifies the same listing, but includes no prices.", left)
    body = s[left:right]
    if not body.endswith("\n\n"):
        raise RuntimeError(f"{path}: unexpected comparison branch")
    estimate_start = body.index("      // A model for a comparable booking cost;")
    estimate_end = body.rfind("\n    }")
    if estimate_end == -1:
        raise RuntimeError(f"{path}: no expected closing branch")
    estimate_body = body[estimate_start:estimate_end]
    updated = "    const estimatedFallback = async () => {\n" + estimate_body + "\n    };\n\n    if (!connected) return estimatedFallback();\n\n"
    s = s[:left] + updated + s[right:]
    s = replace_one(s,
        "    if (!connected) return estimatedFallback();",
        "    if (connectionError || !connected) return estimatedFallback();", path)
    # If a verified external quote is not available, display a transparent
    # illustrative cost estimate rather than an empty comparison card.
    for old, new in [
        ("    if (!listingId) return unavailable();", "    if (!listingId) return estimatedFallback();"),
        ("    if (cacheError) return unavailable();", "    if (cacheError) return estimatedFallback();"),
        ("    if (claimError || claimed !== true) return unavailable();", "    if (claimError || claimed !== true) return estimatedFallback();"),
        ("    if (!quote) return unavailable();", "    if (!quote) return estimatedFallback();"),
        ("    if (saveError) return unavailable();", "    if (saveError) return estimatedFallback();"),
    ]:
        s = replace_one(s, old, new, path)
    return s


PATCHES = {
    "app/page.tsx": patch_home,
    "app/stays/page.tsx": patch_stays,
    "components/StayResults.tsx": patch_results,
    "components/webapp/GuestWebApp.tsx": patch_guest_app,
    "components/BookingCard.tsx": patch_booking_card,
    "components/DirectBookingValue.tsx": patch_comparison_ui,
    "components/DirectBookingValue.module.css": patch_comparison_styles,
    "app/api/booking/airbnb-comparison/route.ts": patch_comparison_route,
}


def main() -> int:
    root = Path(__file__).resolve().parent
    if not (root / "package.json").exists():
        print("ERROR: Extract this ZIP into the Find A Place repository ROOT first.")
        return 1

    # Verify every target BEFORE writing any changes.
    originals = {}
    changes = {}
    for path, patch in PATCHES.items():
        target = root / path
        if not target.is_file():
            print(f"ERROR: Missing file {path}")
            return 1
        raw = target.read_bytes()
        found = blob_sha(raw)
        if found != EXPECTED[path]:
            print(f"ERROR: {path} differs from the Nov 11 audited version. Aborted safely.")
            print(f"  expected Git blob {EXPECTED[path]}\n  found             {found}")
            return 1
        originals[path] = raw
        try:
            new = patch(raw.decode("utf-8"))
        except Exception as err:
            print(f"ERROR: Unable to safely patch {path}: {err}")
            return 1
        if new == raw.decode("utf-8"):
            print(f"ERROR: No edits made to {path}")
            return 1
        changes[path] = new.encode("utf-8")

    # Prefer hidden Git metadata for backups; an exported project without a .git
    # directory can still be updated, with backups held outside the project.
    if (root / ".git").is_dir():
        backups = root / ".git" / "fap-guest-overlays" / "2026-11-11"
        backups.mkdir(parents=True, exist_ok=True)
    else:
        import tempfile
        backups = Path(tempfile.mkdtemp(prefix="FAP_guest_backup_"))
    print(f"Backups: {backups}")
    for path, original in originals.items():
        backup = backups / path
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(original)

    for path, new in changes.items():
        target = root / path
        temporary = target.with_name(target.name + ".fap-overlay.tmp")
        temporary.write_bytes(new)
        os.replace(temporary, target)
        print(f"UPDATED {path}")
    print("SUCCESS: Eight verified source updates applied. Run npm run typecheck and npm run build before pushing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
