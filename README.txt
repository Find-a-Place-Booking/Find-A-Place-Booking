Find A Place Booking - Norfork feedback repair overlay
Prepared 2026-10-14 (repository main inspected; not deployed)

APPLY
1. Extract the contents of this ZIP into the Find-A-Place-Booking repository root.
2. Overwrite the matching files while preserving the folder structure.
3. Commit and push to trigger the normal Vercel deployment.
4. Run one TEST checkout (do not charge a real guest) on a no-pets listing and a pet-friendly listing.

FILES INCLUDED
app/api/booking/hold/route.ts
  A backend pet-policy guard. Requests with pets > 0 require a matching
  unit_policies('pets-allowed') entry. Disallowed pets return HTTP 400
  before consuming a Turnstile token. Pet policy query problems fail closed
  (503), rather than silently allowing pets. Nothing else in the hold or
  payments pipeline has changed.

app/checkout/page.tsx
app/checkout/checkout-no-pets.css
  No-pets listings show a neutral notice and hide the pets selector.
  The server-side check remains authoritative for crafted requests.
  All other checkout fields/payment flow are left unchanged.

lib/public/nearby-destination-search.ts
  Added reliable destination coordinates for Mountain Home, Calico Rock,
  and Norfork, AR. These searches now work without Mapbox geocoding and
  include Norfork Hideaway within 15 miles; default radius remains 40mi.
  Existing geocoding, location filtering and search UI remain unchanged.

INVESTIGATED AND NOT MODIFIED
- Turnstile: current GuestCheckout catch path clears turnstileToken and
  increases resetSignal, which remounts/clears TurnstileWidget. Security
  verification is unchanged and never bypassed. A visual Cloudflare success
  alone cannot certify server-side Siteverify acceptance. A live checkout
  rejection should be traced through Vercel rejection codes; Vercel log
  access is currently restricted (403).
- Airbnb/Vrbo: Norfork's inbound connections are HEALTHY; outbound FAP
  source-specific feeds exist and return calendar events. In Host > Calendar,
  for each source use its "Find A Place outbound feed for [source]" link;
  copy that into THAT platform's Import Calendar setting. Do NOT re-import
  a general feed into the same source, since it can cause calendar echo loops.
  External platforms refresh iCal on their own schedules.
- Holiday minimum stays: existing Host > Rates & fees > [property] >
  Holiday & date requirements already supports date-specific 3-night rules.
  Rules control arrival dates and do not edit the external PMS minimum stay.
  Editing directly inside the availability calendar is not yet supported.
- Photos: OnboardingPhotoManager already supports move left/right,
  set primary cover, and 25 photo uploads, before publishing.

PRODUCTION VERIFICATION
- Search /stays?where=Mountain+Home&radius=15 and ...where=Calico+Rock
  and confirm Norfork Hideaway is present when dates/guest count match.
- On Norfork checkout, confirm the pet selector is hidden, notice is visible,
  and reservations work with 0 pets when Turnstile verifies.
- On a pets-allowed listing, confirm the selector remains visible.
- Confirm an invalid/deliberately modified pets>0 request for a no-pets
  listing responds 400, with no new hold or payment.
- Force a failed hold (e.g. expired token): the Turnstile widget must clear
  and remount before another attempt, preserving the name/email/phone fields.
- Check Airbnb/Vrbo round-trip calendar by importing the correct URLs into
  external calendars and waiting for their refresh cycle.

COMPATIBILITY
Does not replace app/checkout/layout.tsx or any insurance overlay files.
Does not touch Stripe, calendar data, rate rules, reservations or tax settings.
This is a code overlay; no database migrations or environment variables.
