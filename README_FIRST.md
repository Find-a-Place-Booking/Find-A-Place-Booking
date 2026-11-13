# Find A Place — Cabins Only in Featured Stays

**Direct overwrite ZIP — no install scripts or patch commands.**

## Root cause

The verified-cabin selection helper had been added to the GitHub repository, but the homepage was still calling `getPublishedProperties(14)` and drawing the hero and grids from those unfiltered results. That can display RV sites and campsites.

## Install

1. Extract this ZIP into the **root** of your Find A Place Booking project (folder with `package.json`).
2. Allow overwrite of **`app/page.tsx`** and **`lib/public/featured-launch-cabins.ts`**.
3. Run `node --test tests/home-featured-cabins.test.mjs` and then `npm run build`.
4. Commit and push those source files and the test. Vercel must deploy the new commit.
5. Hard refresh the home page and inspect the hero, Featured Stays grid, and lower homepage stay grid.

## Enforced rules

- Hero featured stay: published + `homepage_feature_priority = 1` + verified partner + `property_type = Cabin`.
- Featured Stays cards: exactly the same rules.
- Lower home grid: exactly the same rules. No campsites, RV sites or other property types.
- No fallback to non-cabin stays if fewer than 14 qualified cabins are available or the eligibility query fails.
- The *normal search results, collections, and map* still include every published stay type, including RV and camping, as before.
- The homepage fetches **all eligible priority-ordered inventory before selecting cabins** so a top-14 cutoff cannot exclude valid partner cabins; it then limits the homepage to 14 cabins (8 in first grid and 6 in second grid).
- No edits to booking or payment handling, calendar syncing, Stripe, host prices, or database content.

## QA

- Source matches GitHub `main` `app/page.tsx` as of November 12, 2026 (blob SHA `5ce1acc869999256c136d0cdee80e5d2d082233d`) plus only the featured-stays selection change.
- Transpilation syntax and 2 source guard tests validated on the provided files.
- Full Next.js build and visual live-site test must run after install; no direct GitHub write permission was available here.

*If your local app/page.tsx has changed since that GitHub version, review the diff before overwriting rather than replacing newer work.*
