FIND A PLACE BOOKING — HYBRID AIRBNB COMPARISON
Direct full-file overlay | November 4, 2026

DROP-IN INSTALL
Unzip this archive into the root of Find-A-Place-Booking source, replace
matching files, commit and push to GitHub for Vercel deployment.
No installer, BAT, shell, Python patch or interactive setup steps.

This includes all source files from the previous AUTOMATIC AIRBNB comparison
overlay plus the updated two-tier comparison. You do NOT need to apply the
previous automatic-comparison ZIP first. It also retains Round 8's staged
guest-paid fee code; the payment model remains test-only at the DB layer.

HOW TWO-TIER COMPARISON WORKS
1) AIRBNB-LINKED PROPERTY: Identify the exact Airbnb listing ID from the
   host's existing connected Airbnb iCal URL. Get an exact-date, exact-guest
   BEFORE-TAXES quote from a configured third-party Airbnb price provider.
   Show a VERIFIED comparison only when the quote matches the listing, dates,
   guest count, USD currency and BEFORE-TAXES basis and is less than 2 hours old.
   If no provider quote exists, show no amount. Do not replace it with a guess.

2) PROPERTY WITHOUT AIRBNB CONNECTION: Quote the selected stay on Find A
   Place, including required cleaning and platform guest fees in the pre-tax
   total. Build an explicitly ESTIMATED AIRBNB-EQUIVALENT price based on a
   hypothetical same-host-proceeds price under Airbnb's typical US 15.5%
   host service fee. Include Find A Place's true commission tier (5% partner /
   7% standard) for the current HOST-paid fee model, or account for the
   staged guest-paid fee for TEST transactions.

   Model formula (cents):
   base_stay = FAP_guest_pre_tax_total - FAP_guest_service_fee
   FAP_host_fee = fee_payer == HOST ? round(lodging * rate) : 0
   equal_platform_fee_proceeds = base_stay - FAP_host_fee
   modeled_Airbnb = round(equal_platform_fee_proceeds / (1 - 0.155))
   modeled_savings = modeled_Airbnb - FAP_guest_pre_tax_total

   This is a fee model ONLY. It is not the host's real Airbnb listing price,
   does not guarantee savings, does not model differences in card processing,
   tax, optional pets/addons, promo discounts, pricing strategy, or exception
   host-fee rates. These assumptions are explained beside the comparison.

Both comparison types are automatic. No guest price-entry form.
All amounts displayed in the comparison are BEFORE lodging taxes.
When the estimated model indicates no savings, the UI does not falsely claim
savings. When actual Airbnb is cheaper, the comparison says so.

PLACEMENTS
- Checkout: Automatic for selected dates and guests, before payment.
- Booking receipt/confirmation: The widget reads original unit/dates/guest
  count from the booking's stored pricing snapshot. It renders only when
  the original pre-tax subtotal still matches the current exact-date quote.
  It is hidden for trips with optional pet fees, add-ons or discounts, or
  when quotes no longer match. This prevents comparing unlike amounts.

PRICING PROVIDER STILL REQUIRED FOR VERIFIED COMPARISONS
The older backend integrates the optional Apify actor:
  https://apify.com/thelastscraper/airbnb-scraper
Set server-only APIFY_API_TOKEN on Vercel and redeploy after approving and
VALIDATING the actor with actual known Airbnb stays. The actor is a private
third-party data provider, not an official Airbnb API. Exact-date quote fields
must be verified in the actor's real output; the API rejects insufficient data.
Without APIFY_API_TOKEN, linked listings do NOT display verified savings.
An iCal feed alone has no prices.

DATABASE STATUS
The connected Supabase database already has the earlier two migrations:
- supabase/migrations/20261104090000_guest_paid_fee_staged.sql
- supabase/migrations/20261104103000_airbnb_automatic_price_comparison.sql
They are present in this ZIP so your repo has their source/history; do not
manually re-run on the already-migrated database. No new migration needed.
The guest-paid platform fee remains LIVE OFF and TEST ON.

SAFETY
- No changes to paid reservations, payment amount settlement or taxes.
- No removal of calendar checks, lease controls or Stripe safety rules.
- No iCal secret URL exposed to the guest.
- Provider requests are DB rate limited and cached.
- Estimate calculation is server-side and cannot be set by browser prices.
- A failed Airbnb connection lookup cannot be represented as unlinked.
- The previous provider parser now requires explicit matching dates, guest
  count and before-tax total before presenting a quote as verified.

VALIDATION
- TypeScript/TSX syntax checked across overlay source.
- Pure formula tests for HOST 5%, HOST 7%, GUEST 5%, GUEST 7%, invalid amounts.
- End-to-end live Airbnb provider and Next.js build not performed here.
- Nothing in this ZIP is deployed until you push it.

DO NOT SET fap_guest_fee_rollout.live_enabled=true UNTIL STRIPE AND TAX TESTS
HAVE PASSED. The guest-paid rollout is separate from this comparison UI.
