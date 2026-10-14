Find A Place Booking - TS2322 build fix, Oct 14 2026

This ZIP overlays EXACTLY ONE source file:
  components/FindAPlacePartnerMap.tsx

It fixes the Vercel errors:
  app/about/page.tsx(485,11): Type 'string | null' is not assignable to 'string | undefined'
  app/about/page.tsx(487,11): Type 'string | null' is not assignable to 'string | undefined'

Changes: the partner map component now accepts null or undefined copy values for
'eyebrow' and 'description', and uses its existing fallback copy when values are null.
No location, map, search, calendars, payments, CSS, or other files are changed.

To apply: unzip contents at the ROOT of your Find-A-Place-Booking repository,
overwriting components/FindAPlacePartnerMap.tsx only.

Then run:
  npm run typecheck
  npm run build
  git add components/FindAPlacePartnerMap.tsx
  git commit -m "Fix nullable partner map copy TypeScript error"
  git push origin main

If more TypeScript errors appear after these two, paste the next build log.
Production is not changed until you commit and deploy. GitHub connector returned 403
when attempting this direct edit, so it could not be committed automatically.
