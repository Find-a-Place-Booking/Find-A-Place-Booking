FIND A PLACE BOOKING — AUTOMATIC AIRBNB PRICE COMPARISON
Direct replacement-file overlay — November 4, 2026

THIS REPLACES ROUND 8'S GUEST-ENTERED AIRBNB COMPARISON.
No guest-entered OTA prices, no guess based on Airbnb's average service fee,
no BAT files, installers, shell scripts, or patch scripts.

Extract the ZIP into the ROOT of the Find-A-Place-Booking Git repository.
Replace matching app/ components/ and lib/ files, then commit and push to GitHub.

WHAT IT DOES:
- Identifies the matching Airbnb listing from the Airbnb iCal integration's
  numeric listing ID. The iCal URL's secret token is NEVER displayed.
- For the same Airbnb listing, dates and guest count, queries a configured
  third-party Airbnb pricing provider (Apify) for the US visitor price.
- Compares price BEFORE TAXES against Find A Place's accurate quote for
  the same date range, guest count, and BEFORE TAXES basis.
- Shows a small automatic "$X less here than Airbnb" comparison without
  asking the guest to type anything.
- Shows an honest unfavorable comparison if Airbnb is cheaper.
- If prices cannot be fetched or aren't comparable, hides the numerical claim.
- Caches successful quotes for two hours. A DB rate limiter caps each unit to
  6 new keys/hour and platform-wide to 120 new keys/hour, with a 30-minute
  cooldown for the same dates/party. This avoids runaway vendor charges.
- User-facing checkout and booking confirmation never receive iCal feed URLs.
- Existing pricing, Stripe, refunds, tax collection and guest-paid fee rollout
  remain as in Round 8. LIVE guest-paid fees remain disabled by existing DB settings.

EXTERNAL PROVIDER REQUIRED:
The provider code uses the published Apify Actor contract:
  thelastscraper/airbnb-scraper
  https://apify.com/thelastscraper/airbnb-scraper

This actor is an independently maintained third-party scraper, NOT an official
Airbnb partner API. Its price output and terms must be tested and reviewed
before enabling production-wide comparisons.

Add the environment variable APIFY_API_TOKEN to the Find A Place project in
Vercel and redeploy when an Apify account is approved/connected. The application
will not make any paid provider requests without this value. Do not put tokens
in GitHub, chat, .env files checked into source control, or this overlay.

BACKEND MIGRATIONS:
- supabase/migrations/20261104090000_guest_paid_fee_staged.sql documents
  Round 8's previously applied fee-test migration; no need to re-run manually.
- supabase/migrations/20261104103000_airbnb_automatic_price_comparison.sql
  documents the new table and rate-limit function already applied to the
  connected Supabase production database (via the Supabase integration).
- Existing payment, booking and tax rows are unaffected by the migrations.

STATUS:
- Code is prepared as a direct overlay.
- DB schema and claim function are installed; no price quotes were fabricated.
- Syntax checked affected TypeScript/TSX files.
- Without APIFY_API_TOKEN, automatic savings will NOT show, rather than guess.
- End-to-end provider call and exact-price response validation are still
  pending an approved provider account/token.
- Full Next.js build and live browser testing are NOT verified here.

COMPARISON LIMITATION:
The checkout preview uses selected dates, adult guest count, no pets,
no extras and no promo codes. It compares matching before-tax totals.
If guests add pets/add-ons or promotions later in the checkout, this preview
must not be represented as their final price difference. A later enhancement
can use the final checkout quote and a matching Airbnb pet/extras quote.

NO OTHER PLATFORM FEES ARE CHANGED BY THIS OVERLAY.
