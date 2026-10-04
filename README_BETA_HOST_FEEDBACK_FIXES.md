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
