Find A Place Booking - stay social preview primary-photo fix

Drop these files into the project root preserving folders.

Files:
- lib/public/stay-social-image.ts
- app/api/public/stay-social-image/[slug]/route.ts
- app/stays/[slug]/opengraph-image.tsx

Behavior:
1. Read the exact published listing's first/primary stored property photo.
2. Try a 1200x630 transformed signed image.
3. If that cannot be fetched, retry the ORIGINAL primary property photo.
4. Only if both fail, use the Find A Place logo.
5. Return actual image bytes from the Find A Place domain to the crawler.

The dynamic opengraph-image file is also force-dynamic, so a new deployment gets
a fresh metadata image route rather than relying on the bad cached logo result.

This does not modify booking, checkout, calendars, property photos, or normal listing display.
