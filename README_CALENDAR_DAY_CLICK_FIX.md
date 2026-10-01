# Calendar day click fix

I checked the current `main` repository before building this.

The repo still has:
- the original non-clickable `<div>` calendar days;
- the original buried `Block dates` panel.

So the prior calendar overlay never actually replaced the page markup.

This version fixes that specifically.

## After applying

Clicking **any calendar day opens a real day drawer**.

The drawer shows:
- date;
- nightly price;
- minimum stay;
- open/unavailable status;
- every active block on that date;
- whether it came from Find A Place, a checkout hold, manual block, Airbnb,
  Vrbo, ResNexus, ThinkReservations, Guesty, Hostify, Booking.com, OwnerRez,
  Lodgify, Google, or another iCal source;
- Remove for manual blocks.

The clicked date is prefilled into the existing manual block form inside the
drawer.

Quick labels:
- Owner stay
- Maintenance
- Direct booking
- Other

The **old standalone Block dates section is removed**.

## Important

This changes UI only.

It does not change:
- `/host/calendar` routing;
- block creation/removal RPCs;
- reservation routing;
- payment handling;
- iCal sync;
- ResNexus;
- ThinkReservations;
- Supabase schema.

`Direct booking` remains a calendar availability block only. It protects the
dates without inventing a Find A Place payment/reservation record.

## Apply

Overlay the ZIP into the repo root and run:

`APPLY_CALENDAR_DAY_CLICK_FIX.cmd`

The script validates that:
1. the clickable board was installed;
2. the old static calendar is gone;
3. the old buried Block dates panel is gone;
4. the integration/iCal section still exists.

If any of those checks fail, it restores the original page instead of leaving
a half-applied update.

Then run:

`npm run typecheck`

`npm run build`

No Supabase migration is needed.
