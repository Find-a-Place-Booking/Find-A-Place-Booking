# Find A Place Booking — Buffalo River and Luxury category patch

Prepared against the GitHub `main` source read on **November 9, 2026**.

**Scope:** Only discovery/search. Does NOT touch Stripe, booking checkout, reservation changes, calendars, Supabase schema, discounts, or fees.

## Changes

- Fix Buffalo National River collection: **no unlimited text-match override**. Properties with public map coordinates must be within **20 straight-line miles** of NPS river access/campground locations. More NPS points are included from upper to lower river, covering places missed by the original 3-center algorithm. Coordinates without exact matches use a restricted named-community fallback.
- Change **Unique stays** to **Luxury stays** on the homepage and stay-results chips; initial price-based high-end tier is **$300+/night**, excluding RV/camping sites and unqualified "Other" listings. An editorially curated luxury tag can improve this further later.
- Existing `/stays?filter=Unique%20stays` links continue to work, opening the new Luxury category.
- Add regression tests for missed upper/middle river places, unrelated destinations, no-map fallback, high-price RV exclusion and legacy category links.
- No major visual changes. Existing card grid, buttons, and tracking remain.

**Note:** This is *not yet deployed*. Connected Vercel access returned 403 and GitHub integration denied branch creation. This ZIP modifies your local source; you still need to verify and push.

## Apply

1. Save a separate copy of your current project first, if desired. Extract all ZIP contents into the **root** of your local Find-A-Place-Booking repo (where `package.json` is). The patch checks all required anchors *before* touching any project file and makes a timestamped backup folder **outside** the repo.
2. Double-click `APPLY_OVERLAY.bat` on Windows (or run `python3 apply_overlay.py`). Any mismatch causes a safe abort so it doesn't blindly overwrite changed work.
3. In that directory, run:
   ```sh
   npm run typecheck
   npm run build
   node tests/test_discovery.cjs
   ```
4. Review `git diff` carefully. Then commit only the changed source files and push, which should trigger your normal Vercel deployment:
   ```sh
   git add app/page.tsx app/stays/page.tsx components/StayResults.tsx lib/public/buffalo-river-discovery.ts lib/public/discovery-categories.ts tests/test_discovery.cjs
   git commit -m "Fix Buffalo River radius and replace Unique with Luxury stays"
   git push
   ```
5. After deployment test:
   - `/stays?filter=Buffalo%20National%20River`
   - `/stays?where=Buffalo%20National%20River`
   - `/stays?filter=Luxury%20stays`
   - `/stays?filter=Unique%20stays` (old link backward compatibility)
   - `/stays?filter=Sleeps%208%2B`

**Important limitations:** Straight-line proximity is **not drive time** in the Ozarks. NPS warns that roads do not follow the river and access can be slow. Exact accommodation locations with incorrect coordinates will still need host/admin corrections. $300/night is an initial *price-based* definition of luxury, not a verified property quality rating.

### 25% off first three stays

Not implemented here. Renea's proposal needs a product decision: is it **25% off the guest's nightly rate** for the first three completed reservations (funded by the host or by Find A Place), or **25% off the platform fee** for a new partner's first three bookings? These are very different financial liabilities, so this patch intentionally leaves checkout/Stripe and fees alone.
