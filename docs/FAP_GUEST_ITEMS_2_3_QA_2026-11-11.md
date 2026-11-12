# Find A Place | Guest-facing work list 2 & 3 | audit notes

## Confirmed live database

- There are 20 published, primary-active Cabin stays with homepage priority 1 and VERIFIED partner organizations, across 12 hosts. This is the eligible launch inventory.
- The existing 12-mile Buffalo access-point selection includes Lucky Star and Cabin in the Woods but excludes the Norfork listing in targeted tests. General nearby search remains independent.
- Nearby Experiences data existed already. The overlay adds a dedicated public page and menu entry; it does not create a paid experiences marketplace.

## Implementation boundaries

The homepage `getPublishedProperties(100)` obtains enough rotated public inventory, but `selectLaunchPartnerCabins()` double-checks each item's published status, launch priority, property type, verified host and active primary-unit slug before rendering. The homepage's separate general-interest map still shows all published stays, by design. If the eligibility query fails, it fails closed.

Budget Friendly is a nightly *starting price* filter (`price < 150`), not a promise that every future date has that rate. Luxury starts at $300/night for suitable accommodation types, excluding RV/campgrounds. Unusual accommodation types qualify for Unique even if inexpensive.

The guest mobile gallery uses the existing published-detail `images[]` response and does not expose extra property image paths or private host data.

The external price comparison is informational. Verified same-listing quotes and modeled cross-platform scenarios must never be conflated; a modeled estimate isn't a real observed competitor price. The comparison does not change checkout or tax computation and should not suggest other platforms always cost more.

## Verification limitation

Local TSX syntax parsing and targeted/static checks are complete, but the full Next.js source tree and live browser sessions are not available in the overlay build environment, so project-wide typecheck, production build and end-to-end real booking verification must happen after installing the overlay.
