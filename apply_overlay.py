#!/usr/bin/env python3
"""FAP first-three-stays promotion overlay. All preflight checks before any writes."""
from __future__ import annotations
import datetime, pathlib, shutil, sys

ROOT = pathlib.Path.cwd()
PACK = pathlib.Path(__file__).resolve().parent / 'source'

if not (ROOT/'package.json').exists() or not (ROOT/'app/host/marketing/page.tsx').exists():
    sys.exit('ERROR: Run this from the Find-A-Place-Booking repository root (where package.json lives).')

changes = {}
def file(path):
    p=ROOT/path
    if not p.is_file(): raise RuntimeError(f'Missing expected file: {path}')
    return changes.get(path,p.read_text(encoding='utf-8'))
def put(path,content):changes[path]=content
def sub(path, old, new):
    c=file(path)
    if old not in c or c.count(old)!=1:
        raise RuntimeError(f'Expected anchor missing/ambiguous in {path}: {old[:95]!r}. No project files changed.')
    put(path,c.replace(old,new,1))

try:
    # Public card status. Database returns only published + available intro codes.
    sub('data/catalog.ts', '  nearbyExperienceCount?: number;\n',
        '  introOfferRemaining?: number;\n  nearbyExperienceCount?: number;\n')
    sub('lib/public/listings.ts', 'import type { NearbyExperiencePreview, Property } from "@/data/catalog";',
        'import type { NearbyExperiencePreview, Property } from "@/data/catalog";\nimport { getPublicIntroOffers } from "@/lib/public/intro-offers";')
    sub('lib/public/listings.ts', '  const coverPaths = rows.map((row) => row.image_paths?.[0] ?? null);',
        '  const introOfferRows = await getPublicIntroOffers();\n  const introByUnit = new Map(introOfferRows.map((offer) => [offer.unitId, offer.remaining]));\n\n  const coverPaths = rows.map((row) => row.image_paths?.[0] ?? null);')
    sub('lib/public/listings.ts', '      nearbyExperienceCount: nearby?.count ?? 0,',
        '      introOfferRemaining: introByUnit.get(row.unit_id) ?? 0,\n      nearbyExperienceCount: nearby?.count ?? 0,')

    sub('components/PropertyCard.tsx', '        {availabilityConfirmed ? (',
        '''        {Number(property.introOfferRemaining || 0) > 0 ? (
          <div className={styles.introOffer} aria-label="New host 25 percent discount">
            <strong>New host special · 25% off</strong>
            <span>First {property.introOfferRemaining} {property.introOfferRemaining === 1 ? "booking" : "bookings"} · lodging only</span>
          </div>
        ) : null}

        {availabilityConfirmed ? (''')
    css='components/PropertyCardEnhancements.module.css'
    css_content=file(css)
    if '.introOffer {' in css_content: raise RuntimeError('Offer CSS already present - refusing duplicate application')
    put(css,css_content+'''
.introOffer {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 3px 8px;
  margin: 7px 0;
  padding: 8px 10px;
  border: 1px solid #b8d0be;
  border-radius: 8px;
  background: #eef4ec;
  color: #315841;
  font-size: .71rem;
  line-height: 1.4;
}
.introOffer strong { font-weight: 800; }
.introOffer span { font-size: .65rem; }
''')

    # Details page: read status server-side; no data is trusted from URL params.
    sub('app/stays/[slug]/page.tsx',
        'import { getPublishedListingBySlug } from "@/lib/public/listings";',
        'import { getPublishedListingBySlug } from "@/lib/public/listings";\nimport { getPublicIntroOfferForUnit } from "@/lib/public/intro-offers";')
    sub('app/stays/[slug]/page.tsx',
        '  const checkoutEnabled =\n    process.env.BOOKING_CHECKOUT_ENABLED === "true";',
        '  const introOffer = await getPublicIntroOfferForUnit(property.unitId);\n  const checkoutEnabled =\n    process.env.BOOKING_CHECKOUT_ENABLED === "true";')
    sub('app/stays/[slug]/page.tsx', '            <h1>{property.name}</h1>',
        '''            <h1>{property.name}</h1>
            {introOffer ? (
              <p style={{display:"inline-block",margin:"8px 0",padding:"8px 12px",borderRadius:8,background:"#eef4ec",color:"#315841",fontWeight:750}}>
                New host special: 25% off lodging · {introOffer.remaining} {introOffer.remaining===1?"booking":"bookings"} left
              </p>
            ) : null}''')

    # Checkout price preview and actual hold both reuse the existing promotion RPC.
    sub('app/checkout/page.tsx',
        'import { getPublishedListingBySlug } from "@/lib/public/listings";',
        'import { getPublishedListingBySlug } from "@/lib/public/listings";\nimport { getPublicIntroOfferForUnit } from "@/lib/public/intro-offers";')
    sub('app/checkout/page.tsx',
        '  lodging_subtotal_before_discount_cents?: number;',
        '  discount_cents?: number;\n  lodging_subtotal_before_discount_cents?: number;')
    sub('app/checkout/page.tsx', '  unitId: string;\n  checkIn: string;',
        '  unitId: string;\n  promotionCode?: string | null;\n  checkIn: string;')
    sub('app/checkout/page.tsx','      promotion_code: null,',
        '      promotion_code: input.promotionCode || null,')
    sub('app/checkout/page.tsx', '  const initialEstimate = await getInitialQuote({',
        '''  const introOffer = (params.reservationId && params.checkoutToken)
    ? null
    : await getPublicIntroOfferForUnit(property.unitId);
  const initialEstimate = await getInitialQuote({
    promotionCode: introOffer?.code || null,''')
    sub('app/checkout/page.tsx','              {feeLines.map((line, index) => (',
        '''              {Number(initialQuote?.discount_cents || 0) > 0 ? (
                <div><span>New host offer · 25% off lodging</span><b>−{money(Number(initialQuote?.discount_cents || 0), currency)}</b></div>
              ) : null}
              {feeLines.map((line, index) => (''')
    sub('app/checkout/page.tsx', '            initialCheckoutToken={params.checkoutToken || null}',
        '            initialCheckoutToken={params.checkoutToken || null}\n            initialPromotionCode={introOffer?.code || ""}')
    sub('components/GuestCheckout.tsx',
        '  initialCheckoutToken?: string | null;\n};',
        '  initialCheckoutToken?: string | null;\n  initialPromotionCode?: string;\n};')
    sub('components/GuestCheckout.tsx',
        '  initialCheckoutToken,\n}: Props) {',
        '  initialCheckoutToken,\n  initialPromotionCode = "",\n}: Props) {')
    sub('components/GuestCheckout.tsx',
        '  const [promotionCode, setPromotionCode] = useState("");',
        '  const [promotionCode, setPromotionCode] = useState(initialPromotionCode);')
    sub('components/GuestCheckout.tsx',
        '                <span>Promo code <small>optional</small></span>',
        '                <span>Promo code <small>{initialPromotionCode ? "New host discount applied" : "optional"}</small></span>')

    # Holds are authoritative: if no other code is supplied, attach the system offer.
    sub('app/api/booking/hold/route.ts',
        'import { createAdminClient } from "@/lib/supabase/admin";',
        'import { createAdminClient } from "@/lib/supabase/admin";\nimport { getPublicIntroOfferForUnit } from "@/lib/public/intro-offers";')
    sub('app/api/booking/hold/route.ts', '    const holdArgs = {',
        '''    const systemIntroOffer = body.promotionCode?.trim()
      ? null
      : await getPublicIntroOfferForUnit(body.unitId);
    const holdArgs = {''')
    sub('app/api/booking/hold/route.ts',
        '      requested_promotion_code: body.promotionCode?.trim() || null,',
        '      requested_promotion_code: body.promotionCode?.trim() || systemIntroOffer?.code || null,')

    # System-managed offer codes are controlled in Marketing, not editable
    # from ordinary host rate/code settings.
    sub('app/host/rates/[slug]/page.tsx',
        '  const feeRecord = (type: string) => pricing.fees.find((item) => item.fee_type === type) ?? null;',
        '  const editablePromotions = pricing.promotion_codes.filter((item) => !item.code.startsWith("FAP25-"));\n  const feeRecord = (type: string) => pricing.fees.find((item) => item.fee_type === type) ?? null;')
    for old, new in [(
        'pricing.promotion_codes.length', 'editablePromotions.length'),
        ('pricing.promotion_codes.map((promotion)', 'editablePromotions.map((promotion)')
    ]:
        content=file('app/host/rates/[slug]/page.tsx')
        if old not in content: raise RuntimeError('Missing managed-promo UI anchor')
        put('app/host/rates/[slug]/page.tsx', content.replace(old,new))

    # Onboarding embeds the same saved opt-in form available from the host dashboard.
    sub('app/host/onboarding/page.tsx',
        'import { HostOnboardingWizard } from "@/components/HostOnboardingWizard";',
        'import { HostOnboardingWizard } from "@/components/HostOnboardingWizard";\nimport { IntroMarketingForm } from "@/components/IntroMarketingForm";')
    sub('app/host/onboarding/page.tsx',
        'import { getHostAccountProfile } from "@/lib/host/profile";',
        'import { getHostAccountProfile } from "@/lib/host/profile";\nimport { createClient } from "@/lib/supabase/server";')
    sub('app/host/onboarding/page.tsx',
        '  return (\n    <DashboardShell active="Properties" title="Host & property setup" eyebrow="Host setup">',
        '''  const supabase = await createClient();
  const { data: introPrefs } = await supabase.rpc("fap_host_intro_status", {
    target_organization_id: onboarding.organizationId,
  });
  return (
    <DashboardShell active="Properties" title="Host & property setup" eyebrow="Host setup">''')
    sub('app/host/onboarding/page.tsx',
        '''        <h2>Interested in promotions?</h2>
        <p>Tell us whether you'd consider three discounted stays or additional social media advertising. We'll follow up on dates and details first; this won't change your rates or charge you for anything.</p>
        <Link href="/host/marketing" className="button button-small button-quiet">Marketing options & partner status →</Link>''',
        '''        <h2>Welcome discount for your first three stays</h2>
        <p>Optional: offer guests 25% off lodging on the first three bookings of each eligible property. Guests will see the offer in search results and it will be applied automatically at checkout.</p>
        {introPrefs ? <IntroMarketingForm preferences={introPrefs} returnTo="onboarding" /> : (
          <Link href="/host/marketing" className="button button-small button-quiet">Open marketing settings →</Link>
        )}''')
    sub('app/host/onboarding/page.tsx', '    avatarRemoved?: string;',
        '    avatarRemoved?: string;\n    saved?: string;\n    emailPending?: string;')
    sub('app/host/onboarding/page.tsx',
        '      <OnboardingPublicHostProfile profile={profile} />',
        '''      {params.saved ? <div className="admin-message success">Introductory offer preferences saved.</div> : null}
      {params.emailPending ? <div className="admin-message error">Advertising request saved, but email delivery is pending. Please save again to retry.</div> : null}
      <OnboardingPublicHostProfile profile={profile} />''')
except RuntimeError as e:
    sys.exit(f'ABORTED: {e}')

# New files; preflight for overwritten local work.
for p in sorted(PACK.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(PACK).as_posix()
    content=p.read_text(encoding='utf-8')
    existing=ROOT/rel
    if existing.exists() and rel not in ('app/host/marketing/page.tsx','app/host/marketing/actions.ts'):
        if existing.read_text(encoding='utf-8') != content:
            sys.exit(f'ABORTED: File already exists with different content: {rel}')
    if rel in ('app/host/marketing/page.tsx','app/host/marketing/actions.ts'):
        # These are full replacements; require markers from the inspected 2026-11-09 revision.
        original=(ROOT/rel).read_text(encoding='utf-8')
        expected='get_host_marketing_preferences' if rel.endswith('page.tsx') else 'set_host_marketing_preferences'
        if expected not in original:
            sys.exit(f'ABORTED: Unrecognized marketing page/action: {rel}. No files changed.')
    changes[rel]=content

stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup=ROOT.parent/f'{ROOT.name}-intro25-backup-{stamp}'
for rel in changes:
    target=ROOT/rel
    if target.exists():
        b=backup/rel
        b.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(target,b)
for rel,content in changes.items():
    target=ROOT/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(content,encoding='utf-8')
print(f'Applied {len(changes)} files. Pre-change backup: {backup}')
print('Next: apply SQL migration, run npm run typecheck and npm run build, test checkout and emails before production push.')
