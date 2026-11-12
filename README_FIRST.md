# Find A Place Booking — Direct Price Comparison & Neutral Naming

**Apply on top of the 11/11 Guest Experience / Immediate Price overlays.**

## What this changes

- **Linked external listing:** Looks up an actual date- and party-matched booking quote from a configured authorized external price source or supported verified public quote. Displays **VERIFIED** only when a fresh, exact pre-tax price was obtained for the same property, dates, and guest count. If a verified quote cannot be obtained, shows a transparent "same-stay price check unavailable" message instead of invented savings. A calendar feed on its own does not contain booking prices.
- **No linked listing:** Keeps the existing illustrative equal-host-proceeds fee model and labels the response **ESTIMATED**. Assumption: a hypothetical 15.5% host-side fee at another platform. It is not a competing site's actual price or a broad market average.
- **Neutral public copy:** No competitor names or competing company logos in the comparison widget; uses **Other booking platforms**, **Checked price**, and **Illustrative estimate**. Internal provider-specific API/file names remain for compatibility, but aren't shown to guests.
- **Never claims savings unless the compared modeled or verified total is actually higher.** Negative/zero differences get truthful headlines.
- **Payments unchanged:** No checkout charge, taxes, refund, Stripe, calendar, booking or reservation modifications.
- **Pre-tax consistency:** Both compared figures are pre-tax; checkout still shows the actual total inclusive of applicable taxes.

## Install

1. Unzip into the root of your Find A Place Booking repository; overwrite `components/DirectBookingValue.tsx`.
2. Double-click `APPLY_DIRECT_COMPARISON.bat` (Windows, Python 3), or run `python APPLY_DIRECT_COMPARISON.py` at repository root. This safely modifies only `app/api/booking/airbnb-comparison/route.ts`, and aborts if that file has unexpected changes.
3. Run `npm run build` and project test suite; then commit and push.
4. Verify a nonlinked property (illustrative), a linked property with a **verified** quote (exact direct price), and linked with no verified quote (transparent unavailable state).

**Important:** Automated public page collection is OFF by default after this patch because the external platform terms prohibit unapproved bots/scrapers. Do not enable it without authorization. This is a narrow follow-up overlay; it does *not* bundle the prior full homepage, experiences or immediate-nightly-preview patches. Apply it **after** those patches. No production deployment or database write was performed by preparing this ZIP.

## How to make real direct quotes appear

Find A Place currently has 26 active externally connected listings and no *fresh* verified price quotes in the production cache (checked Nov 11, 2026). A linked calendar identifies the listing but doesn't expose that booking site's guest total. For the strongest and most reliable comparison, configure a properly authorized server-side exact-price feed (`AIRBNB_PRICE_FEED_URL` / `AIRBNB_PRICE_FEED_TOKEN` in existing code). It must give the same listing ID, dates, guest count, USD currency and total **before taxes**. Do not guess a quote or try to bypass competitor access controls. Without such a feed or an authorized successful public quote, the linked-listing comparison remains unavailable rather than fabricating savings.
