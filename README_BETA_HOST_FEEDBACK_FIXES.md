# Beta host feedback fixes — 2026-10-03

This overlay is cumulative with the earlier inline-calendar-onboarding overlay.
It keeps those files and adds the three issues caught during live host onboarding.

## 1. Bed types now support quantities

The old setup treated King / Queen / Twin / etc. as yes/no amenities. That could
say a cabin had a queen bed, but not 2 queens + 2 twins.

The Location & capacity step now has a dedicated **Bed types & quantities**
control with +/- and numeric counts for. The old yes/no sleeping-arrangement
amenities are hidden from onboarding so hosts only see one bed setup there:
- King
- Queen
- Full / double
- Twin / single
- Bunk bed
- Sofa bed
- Futon
- Murphy bed
- Crib

The total bed count updates automatically. The structured configuration is
saved to `property_units.bed_configuration`, while `property_units.beds` keeps
the total count for existing code. The shared legacy amenity catalog is left in
place for existing listings/property-editor compatibility.

The production DB change for this is already applied. A reference SQL copy is
in `supabase/reference/2026-10-03-bed-configuration.sql`. A small consistency
trigger also clears structured bed details if an older editor later changes the
legacy total-bed number without changing the structured setup, so guest-facing
bed details cannot silently become contradictory.

While doing this, the completion path was also corrected so max guests,
bedrooms, beds, bathrooms, minimum stay, check-in/out and cancellation terms
from onboarding are written to the real rentable unit before publication.

## 2. Mobile listing photos no longer extreme-crop

Guest search cards now use a 4:3 frame with `object-fit: contain` on screens at
700px and below. The mobile stay-detail hero uses the same rule. Desktop/iPad
layouts remain unchanged.

This intentionally prefers showing the whole host-selected photo over filling
every pixel with a crop. Neutral background can appear around unusually tall or
wide photos.

## 3. Back to results restores the browse session

Stay detail pages now show a visible **← Back to results** button.

When a traveler opens a stay from `/stays`, the browser session stores:
- the exact search URL (destination/dates/guests)
- active filter chips
- sort selection
- map shown/hidden state
- scroll position

Returning to results restores those values instead of making the traveler start
over. Direct links to a stay safely fall back to `/stays`.

## Extra onboarding guard caught during verification

The onboarding UI supports 25 photos, but the live `save_host_onboarding` RPC
still rejected a 25-photo draft because its server-side limit was `> 24`. That
off-by-one is corrected in production to `> 25`. A reference note is included
at `supabase/reference/2026-10-03-onboarding-photo-limit-25.sql`.

## Boundaries

No booking hold, quote, Stripe, reservation, iCal/PMS synchronization, or
canonical availability code is changed by this overlay.

## Onboarding layout CSS cleanup
- Removes the decorative `Complete once` third column from the working onboarding layout.
- Expands the real onboarding form into the freed space.
- Keeps the step rail compact/sticky on desktop.
- Preserves the existing single-column mobile wizard.
- No onboarding, booking, payment, calendar, or availability logic is changed.


## v3 onboarding layout correction
The earlier CSS-only attempt was not sufficient because the global `.wizard` rule still reserved a third 220px grid column. v3 fixes the source component itself:
- removes the decorative `Complete once` aside from the DOM
- sets the wizard to exactly two columns inline: step rail + form
- removes the form's old 780px max-width so it can use the available space
- keeps the existing mobile `display:block` behavior
- does not change onboarding data, booking, payments, calendar, or availability logic


## Social share + mobile image follow-up
- Stay pages no longer publish a short-lived private Supabase signed image URL directly in `og:image`.
- Added `/api/public/stay-social-image/[slug]`, a stable same-domain endpoint that streams the listing's primary photo for Facebook/Twitter crawlers.
- The endpoint requests a 1200×630 social crop and falls back to the original image if image transformations are unavailable.
- Mobile search cards still show the full primary photo, but the empty side area is now filled by a blurred crop of the same image instead of flat beige bars.
- Desktop listing cards are unchanged.

## ResNexus status check
- Fancy Hill's live ResNexus `BROWSER_WORKER` connections were checked directly.
- The active connections were HEALTHY with a fresh successful sync.
- `Lil' Rustic` was the one stale preference mismatch: the listing said ICAL even though its only active source was ResNexus. That production record was corrected to PMS.
- No ResNexus booking/block data was rewritten as part of this UI patch.


## V5 mobile card image correction
- Removed the `contain + blurred side fill` treatment from mobile listing cards.
- Mobile cards now use a square image frame with the real listing image set to `object-fit: cover`.
- This fills the card edge-to-edge while cropping portrait uploads much less aggressively than the original short landscape frame.
- Desktop card rendering is unchanged.
- No booking, calendar, checkout, pricing, or property data logic changed.


## V6 mobile image rendering correction
- Removed the fixed square mobile image frame.
- Mobile property cards now render the primary image at its natural aspect ratio.
- No `cover`, `contain`, forced height, or fixed aspect ratio is applied on mobile.
- Portrait photos can make a taller card; this is intentional so the host photo is not cropped or zoomed.
- Desktop card rendering is unchanged.
- No booking, calendar, checkout, pricing, or host data logic changed.


## V7 mobile image final correction — identical to desktop
- Removed the mobile-only `<picture>` / `/api/public/stay-cover/[slug]` source from property cards.
- Mobile and desktop now use the exact same `property.image` URL.
- Removed all mobile-only `.property-image-wrap` and `.property-image` overrides.
- Mobile now inherits the exact desktop image rules:
  - `.property-image-wrap { height: 260px; overflow: hidden; }`
  - global `img { width: 100%; object-fit: cover; }`
  - `.property-image { height: 100%; }`
- No mobile resizing/cropping/contain/blur/natural-height behavior remains.
- No booking, calendar, checkout, pricing, or property data logic changed.
