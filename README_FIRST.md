# Find A Place Booking — category button wiring fix
Checked against GitHub/main 29103264e3771efe5bf42a193891f1e6d3bdeba4 (Nov 12, 2026).

## To apply
1. Copy/extract the contents of this ZIP into the root of your Find-A-Place-Booking repository, keeping folders intact and overwriting the included `app/page.tsx` file.
2. **MUST RUN `APPLY_COLLECTION_FIX.bat` once on Windows** (double-click it, with Python 3 installed). Or `python3 APPLY_COLLECTION_FIX.py` on macOS/Linux. The script wires Unique Stays and Budget Friendly into two existing results files. Merely extracting the ZIP is NOT enough.
3. Run `npm run build`, commit, and push. Make sure the deployment completes before checking the live site.

## Exact behavior
- Buffalo National River: 12 miles straight-line from curated Buffalo access points, with named-community fallback for properties lacking coordinates. It remains its own filter and does not change general destination radius searches.
- Luxury Stays: published stays starting at $300+/night, excluding camp/RV sites; `Other` type must have explicit luxury tag.
- Unique Stays: cabooses, treehouses, yurts, tiny homes, houseboats and similar explicit structures/tags/names. No $300 requirement. It is NOT a redirect to Luxury.
- Budget Friendly: published stays starting UNDER $150/night (`price < 150`), not including $150 exactly. Old `/stays?filter=Under%20%24150` links continue to work.

This archive does not touch Stripe, booking availability, taxes, calendar connections, or Supabase records. It changes three presentation files only (homepage overwrite + results page and results filter script).

If the updater reports a source SHA mismatch, it stops to protect changes pushed since the check. Do not force it.
