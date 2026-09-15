# Find A Place Booking — Brand / Marketplace UI Pass v1.17

Base reviewed: `Find-a-Place-Booking/Find-A-Place-Booking` on `main` at:

`1ff4d3ae455a15de54a6a181929c467fb776d7b6`

This is an **overlay on the existing booking platform**, not a platform rewrite. Copy the included paths over the matching repository paths.

## What v1.17 changes
- Reworked the Find A Place story section into a warmer mini-ad for both travelers and hosts, with more brand-specific copy and a stronger “Find a place” call to action.
- The `/stays` page now has a real dedicated dark-pine search band rather than relying on a fragile background gradient. The results heading/content remains white below it, so the warm cream nav, pine search area, and white results body read as three intentional layers.
- The stays/results page now uses a dark pine band behind the top search area so it sits more cleanly beneath the warm cream navigation and feels consistent with the Find A Place palette.
- Eureka Springs now uses a cleaner aerial downtown image, and the destination-section heading/copy has been tightened into a simple stacked layout so the text reads naturally without changing the card grid.
- Destination cards now use location-specific images (Hot Springs, Lake Ouachita, Caddo River, Eureka Springs, and Branson) with a soft dark overlay so the text stays readable while the section feels less flat and more place-driven.
- Stay-type collage edges are refined so the far-left and far-right images now fill the section edges cleanly, while the center slices keep the angled treatment.
- Added faint separator lines between the collage images so the background panels read as intentional slices instead of blending together too much.
- The Browse by stay type section now uses a full-width collage backdrop built from real stay photos supplied for cabins, waterfront stays, rustic cabins and a premium cabin stay.
- The backdrop uses angled vertical slices with a dark overlay so the foreground cards still feel premium and cohesive with the rest of the site.
- The stay-type UI remains readable and on-brand with warm cream cards and the existing Find A Place palette.

The public side now leans farther into a modern booking-marketplace model while keeping the Find A Place identity. This v1.9 refinement separates the homepage search from the hero and content sections more clearly. The search now lives in its own warm cream band with the popular-destination shortcuts, followed by a subtle divider before the white inventory section, so the top of the page no longer feels visually crowded or merged together.

- The homepage keeps the current hero/search and fills the **Featured Stay** slot from the first published public listing. The current test/fake stay will therefore appear there automatically; if no listing is published, the safe placeholder remains.
- The hero has been simplified again: no decorative patterning, more natural headline scale, cleaner spacing and a more product-like featured-stay panel.
- The top navigation bar on hero-based pages is now a warm cream header with dark charcoal text so it feels distinct, premium and easier on the eye against the dark pine hero.
- The featured stay card now matches the warm cream header more closely, creating a more unified premium palette across the top section.
- The homepage search now lives in its own dedicated warm cream band with the Popular destination shortcuts.
- A subtle divider and a white inventory section create a clear break before Featured Stays, instead of relying only on extra empty space.
- Guest-facing headings and section copy are shorter, clearer and less concept-heavy.
- The first major section now shows up to **8 real published stays** instead of only three oversized editorial cards.
- If enough additional inventory exists, a second property row appears automatically without duplicating or inventing listings.
- Adds a **Find your kind of stay** section with real links for Cabins, RV stays, Waterfront, Pet-friendly, Hot tubs and Under $250.
- Those collection links use the existing result filtering logic. `app/stays/page.tsx` accepts a `filter` query and passes it into `StayResults` as the initial selected filter.
- Destination cards remain part of the Find A Place discovery model, but are now softer, rounder and less table-like.
- Removes the four-step “how booking works” homepage section. Booking should feel self-explanatory, not like the site is explaining its own architecture.
- Keeps the Find A Place story and host invitation lower on the page, after travelers have already seen inventory and ways to browse it.
- The home host CTA no longer explains commission mechanics. Full pricing remains on the dedicated host marketing page.

## Guest UI consistency

The modernization is deliberately scoped to the guest/public experience:

- homepage
- stay search/results
- property detail
- booking card
- checkout placeholder
- trip lookup
- trip detail placeholder
- booking confirmation placeholder
- not-found state
- shared header/footer

Guest surfaces now use the same warm cream/charcoal/pine/rust palette, restrained shadows, cleaner card treatment and consistent empty/coming-soon cards. The marketplace side is intentionally a little more product-like and a little less decorative.

Property imagery stays dominant. The visual system does **not** turn everything into pill-shaped SaaS UI; the editorial Find A Place sections remain more restrained while inventory/search surfaces are softer and more tactile.

## Host/admin boundary

The actual host/admin workspaces are intentionally **not** modernized into the marketplace card language. They remain simple, fast and utilitarian. The shared Find A Place logo/identity is retained, but no host dashboard mechanics or layout behavior are changed.

The public `/hosts` marketing page stays branded, but the host portal itself remains function-first.

## Mechanics preserved

No files under `lib/`, `supabase/`, auth, calendar, pricing, reservation, payment providers, publication/review logic, RLS, host CRUD or admin operations are touched.

The following existing behavior stays intact:

- public inventory still comes only from `getPublishedProperties()` / guest-safe published listing RPCs
- search still uses destination, dates and guests
- property routes remain `/stays/[slug]`
- existing filters and sorting remain client-side
- the new homepage collection links only preselect filters that already existed
- availability/checkout remain safely disabled until the booking milestone is ready
- no fake stays, reviews, availability or map pins are introduced

## Files in this overlay

- `app/layout.tsx`
- `app/page.tsx`
- `app/find-a-place-theme.css`
- `app/stays/page.tsx`
- `app/stays/[slug]/page.tsx`
- `app/hosts/page.tsx`
- `app/checkout/page.tsx`
- `app/trip/page.tsx`
- `app/trip/[confirmation]/page.tsx` **added to the UI overlay in v1.2**
- `app/booking/confirmed/page.tsx` **added to the UI overlay in v1.2**
- `app/not-found.tsx` **added to the UI overlay in v1.2**
- `components/Brand.tsx`
- `components/Header.tsx`
- `components/Footer.tsx`
- `components/SearchBar.tsx`
- `components/PropertyCard.tsx`
- `components/StayResults.tsx`
- `components/BookingCard.tsx`
- `public/brand/find-a-place-seal.png`
- `public/brand/find-a-place-seal-light.png`
- `public/brand/find-a-place-pin.jpg`

## Apply locally

### PowerShell

From the extracted package:

```powershell
.\apply-ui-pass.ps1 -Target "C:\path\to\Find-A-Place-Booking"
```

### Bash

```bash
./apply-ui-pass.sh /path/to/Find-A-Place-Booking
```

Then review the diff and run your normal checks:

```bash
npm run build
```

If your local working tree already contains the earlier pass, v1.17 is intended to replace those same overlay files cleanly.

## Validation performed

- Parsed all **17 TS/TSX overlay files** with TypeScript 5.8.3: **0 syntax errors**.
- Theme CSS brace balance: **OK (409/409)**.
- The remote repository still reports `main` at the base commit above.
- A full `npm run build` cannot be run in this execution container because it cannot clone the full repository over the network.

## Not included yet

- automatic/manual featured-stay selection logic beyond using the first published stay
- real interactive map
- live date availability filtering
- live booking/checkout
- old Find A Place SEO migration/routes/redirects

Those should remain separate from the visual pass.

### v1.17 layout repair

- Fixes the Featured Stays section accidentally rendering as a max-width white slab with gray gutters.
- Featured inventory now sits on a true full-width white band with the actual content constrained inside an inner shell.
- Keeps the cream search band visually separate above it.
- Slightly tightens the first inventory section vertically while inventory is still light.
