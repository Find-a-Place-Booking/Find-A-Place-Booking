#!/usr/bin/env python3
"""Finish Find A Place guest updates and place comparisons alongside prices.

Safe for the November 11 GitHub main snapshot with new files already copied in,
or for the previous overlay with its script already applied. No changes to
payment, booking, calendar, partner, or ResNexus business logic.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent

PRIOR_SIGNATURES = {
    "app/page.tsx": ("selectLaunchPartnerCabins(published)", "getPublishedProperties(100)"),
    "app/stays/page.tsx": ('"Budget Friendly": "Budget-friendly stays under $150"',),
    "components/StayResults.tsx": ('if (filter === "Unique stays") return isUniqueStay(property)',),
    "components/webapp/GuestWebApp.tsx": ('<StayPhotoStrip key={detail.slug}',),
    "components/BookingCard.tsx": ('import { DirectBookingValue }',),
    "components/DirectBookingValue.tsx": ('<strong>Other booking platforms</strong>',),
    "components/DirectBookingValue.module.css": ('.otherPlatform {',),
    "app/api/booking/airbnb-comparison/route.ts": ('const estimatedFallback = async () =>',),
}
PRICE_CARD_SHA = "c38e1a93423c1b550b086702ac3f788f5480045d"


def git_blob_sha(raw: bytes) -> str:
    return hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest()


def ensure_once(source: str, before: str, after: str, path: str) -> str:
    if source.count(before) != 1:
        raise ValueError(f"{path}: expected one precise anchor, found {source.count(before)}: {before[:100]!r}")
    return source.replace(before, after, 1)


def price_home(source: str) -> str:
    path = "app/page.tsx"
    old = 'import { getPublishedMapStays, getPublishedProperties } from "@/lib/public/listings";'
    addon = 'import { NightlySavingsPreview } from "@/components/NightlySavingsPreview";'
    if addon not in source:
        source=ensure_once(source,old,old+"\n"+addon,path)
    meta = '''                <div className="hero-featured-meta">
                  <b>${featuredStay.price}</b>
                  <small>/ night</small>
                </div>'''
    if '<NightlySavingsPreview nightlyPriceUsd={featuredStay.price}' not in source:
        source=ensure_once(source,meta,meta+'''
                <NightlySavingsPreview nightlyPriceUsd={featuredStay.price} minimal />''',path)
    return source


def price_property_card(source: str) -> str:
    path="components/PropertyCard.tsx"
    old='import { TrackedLink } from "@/components/TrackedLink";'
    addon='import { NightlySavingsPreview } from "@/components/NightlySavingsPreview";'
    if addon not in source:
        source=ensure_once(source,old,old+"\n"+addon,path)
    rate = '''        <div className="price-line">
          <strong>${property.price}</strong> / night
          <span>
            {property.reviews > 0
              ? `${property.reviews} reviews`
              : "Independent stay"}
          </span>
        </div>'''
    if '<NightlySavingsPreview nightlyPriceUsd={property.price}' not in source:
        source=ensure_once(source,rate,rate+'''
        <NightlySavingsPreview nightlyPriceUsd={property.price} minimal />''',path)
    return source


def price_booking_card(source: str) -> str:
    path="components/BookingCard.tsx"
    anchor='import { AvailabilityDatePicker } from "@/components/AvailabilityDatePicker";'
    preview_import='import { NightlySavingsPreview } from "@/components/NightlySavingsPreview";'
    comparison_import='import { DirectBookingValue } from "@/components/DirectBookingValue";'
    if preview_import not in source:
        source=ensure_once(source,anchor,anchor+"\n"+preview_import,path)
    if comparison_import not in source:
        source=ensure_once(source,anchor,anchor+"\n"+comparison_import,path)

    # Previous overlay placed this underneath all fee lines. Remove that old
    # instance, so the guest only gets one comparison beside the trip total.
    old_footer = '''      {/* The platform comparison accompanies the actual quote on this page.
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

'''
    if old_footer in source:
        source = source.replace(old_footer, '', 1)

    # First price shown when opening a property: visible even without dates.
    nightly = '''        <b>{testMode ? "Test booking" : "Book on Find A Place"}</b>
      </div>'''
    if '<NightlySavingsPreview nightlyPriceUsd={price}' not in source:
        source=ensure_once(source,nightly,nightly+'''
      {!(estimate && ["valid", "fallback"].includes(dateVerification)) ? (
        <NightlySavingsPreview nightlyPriceUsd={price} />
      ) : null}''',path)

    # The TRUE date quote's price is in estimateHead. Put comparison between
    # that headline and the other fees, rather than below the breakdown.
    quote_anchor = '''            ) : null}
          </div>

          {dateVerification === "checking" || dateVerification === "idle" ? ('''
    if 'className={styles.comparisonImmediate}' not in source:
        quote_dock = '''            ) : null}
          </div>

          {estimate && ["valid", "fallback"].includes(dateVerification) ? (
            <div className={styles.comparisonImmediate}>
              <DirectBookingValue
                compact
                unitId={unitId}
                checkIn={checkIn}
                checkOut={checkOut}
                guests={guests}
                currency={currency}
                receiptPreTaxTotalCents={Number(quote?.pre_tax_total_cents || 0) || undefined}
              />
            </div>
          ) : null}

          {dateVerification === "checking" || dateVerification === "idle" ? ('''
        source=ensure_once(source,quote_anchor,quote_dock,path)
    if source.count('<DirectBookingValue')!=1 or source.count('<NightlySavingsPreview')!=1:
        raise ValueError(f"{path}: duplicate or missing comparison widgets")
    return source



def price_guest_webapp(source: str) -> str:
    path = 'components/webapp/GuestWebApp.tsx'
    anchor='import { StayMap } from "./StayMap";'
    addon='import { NightlySavingsPreview } from "@/components/NightlySavingsPreview";'
    if addon not in source:
        source=ensure_once(source,anchor,anchor+"\n"+addon,path)

    # The mobile list already prints a starting nightly amount; pair it with
    # a conservative, clearly modeled fee illustration immediately below.
    card_anchor='''                        <b>From ${s.startingNightlyUsd}/night</b>
                      </div>'''
    if '<NightlySavingsPreview nightlyPriceUsd={s.startingNightlyUsd}' not in source:
        source=ensure_once(source,card_anchor,card_anchor+'''
                      <NightlySavingsPreview nightlyPriceUsd={s.startingNightlyUsd} minimal />''',path)

    # Mobile stay details previously omitted the nightly starting price even
    # though it was available in the API. Show rate and preview together.
    detail_anchor='''              <h2 className="title">{detail.name}</h2>
              <p style={{ lineHeight: 1.6 }}>{detail.description}</p>'''
    if '<NightlySavingsPreview nightlyPriceUsd={detail.startingNightlyUsd}' not in source:
        source=ensure_once(source,detail_anchor,'''              <h2 className="title">{detail.name}</h2>
              <p className="muted"><strong>From ${detail.startingNightlyUsd}/night</strong></p>
              <NightlySavingsPreview nightlyPriceUsd={detail.startingNightlyUsd} />
              <p style={{ lineHeight: 1.6 }}>{detail.description}</p>''',path)
    return source

def css_pricing(source: str) -> str:
    if '.comparisonImmediate {' in source:
        return source
    return source+'''

/* The trip-specific savings comparison appears right below the quoted total. */
.comparisonImmediate {
  padding: 1px 10px 4px;
  border-bottom: 1px solid #dfe5df;
}
.comparisonImmediate > * { margin: 7px 0; }
'''


def main() -> int:
    if not (ROOT/'package.json').is_file():
        print('ERROR: Unzip into Find A Place repository root, alongside package.json.')
        return 1
    if not (ROOT/'components/NightlySavingsPreview.tsx').is_file():
        print('ERROR: New nightly savings component is missing. Extract the entire ZIP.')
        return 1
    script=ROOT/'APPLY_GUEST_UPDATES.py'
    spec=importlib.util.spec_from_file_location('prior_fap_overlay',script)
    if not spec or not spec.loader:
        print('ERROR: Prior guest patcher is missing');return 1
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    old_counts=0
    applied_counts=0
    for path,expected_sha in module.EXPECTED.items():
        target=ROOT/path
        if not target.is_file():
            print(f'ERROR: Missing {path}');return 1
        data=target.read_bytes()
        if git_blob_sha(data)==expected_sha:
            old_counts+=1
        elif all(marker in data.decode('utf-8') for marker in PRIOR_SIGNATURES[path]):
            applied_counts+=1
        else:
            print(f'ERROR: {path} changed in an unrecognized way; no edits made.')
            return 1

    if old_counts and applied_counts:
        print('ERROR: Some older guest updates were applied and others were not. No edits made; refresh the overlay to avoid overwriting partial changes.')
        return 1

    # Check new patch anchors in-memory before making any changes.
    targets={
        'app/page.tsx':price_home,
        'components/PropertyCard.tsx':price_property_card,
        'components/webapp/GuestWebApp.tsx':price_guest_webapp,
        'components/BookingCard.tsx':price_booking_card,
        'components/BookingCardEnhancements.module.css':css_pricing,
    }
    card=ROOT/'components/PropertyCard.tsx'
    card_bytes=card.read_bytes()
    if git_blob_sha(card_bytes)!=PRICE_CARD_SHA and '<NightlySavingsPreview nightlyPriceUsd={property.price}' not in card_bytes.decode('utf-8'):
        print('ERROR: PropertyCard changed from the reviewed code; no edits made.');return 1

    # If the old script hasn't been applied, dry-run its transforms (including
    # the new pricing placement) first, then invoke its own audited writer.
    if old_counts:
        for path,prior_patch in module.PATCHES.items():
            source=(ROOT/path).read_text(encoding='utf-8')
            try:
                prior_text=prior_patch(source)
                targets[path](prior_text) if path in targets else prior_text
            except Exception as err:
                print(f'ERROR: Original guest overlay incompatible with {path}: {err}');return 1
    changes={}
    originals={}
    # If old overlay is pending, don't perform pricing changes until prior
    # script completes its fully guarded write.
    if old_counts:
        print('Applying previously prepared guest-facing update first…')
        if module.main()!=0:
            print('ERROR: Existing guest overlay failed; price placement aborted.');return 1

    for path,fn in targets.items():
        target=ROOT/path
        if not target.is_file():
            print(f'ERROR: Missing {path}');return 1
        raw=target.read_bytes()
        try:
            result=fn(raw.decode('utf-8'))
        except Exception as err:
            print(f'ERROR: Price placement could not safely update {path}: {err}')
            return 1
        if result != raw.decode('utf-8'):
            originals[path]=raw
            changes[path]=result.encode('utf-8')
    if not changes:
        print('SUCCESS: Price placements were already applied.')
        return 0
    # Back up only in metadata or a temp dir to avoid dirtying the project.
    if (ROOT/'.git').is_dir():
        backups=ROOT/'.git'/'fap-guest-overlays'/'2026-11-11-immediate-pricing'
        backups.mkdir(parents=True,exist_ok=True)
    else:
        import tempfile
        backups=Path(tempfile.mkdtemp(prefix='FAP_savings_backups_'))
    for path,raw in originals.items():
        out=backups/path
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_bytes(raw)
    for path,raw in changes.items():
        out=ROOT/path
        temp=out.with_name(out.name+'.overlay.tmp')
        temp.write_bytes(raw)
        os.replace(temp,out)
        print(f'UPDATED {path}')
    print('SUCCESS: Nightly savings visible immediately; date-specific comparison sits beneath trip total.')
    print('Next: npm run typecheck && npm run build, then commit and push.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
