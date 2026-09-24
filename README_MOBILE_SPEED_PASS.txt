Find A Place Booking — Mobile Speed Pass

Baseline checked against current GitHub main on 2026-09-24.

This package is intentionally TARGETED, not cumulative. It changes only:
- app/page.tsx
- components/PropertyCard.tsx
- components/DeferredBackgroundVideo.tsx
- app/api/public/stay-cover/[slug]/route.ts

Mobile-only behavior:
- <=700px screens use a transformed 1080px / quality 70 property cover.
- Supabase's transformed image response can negotiate WebP automatically.
- The 7.98 MB homepage background video is not downloaded on <=700px screens;
  mobile keeps the existing poster image.
- If the transform service is unavailable, the mobile cover route falls back
  to the original signed property image rather than breaking the card.

Desktop behavior:
- Desktop still uses the same existing property image URLs.
- Desktop still loads the same deferred hero video.
- No desktop CSS/layout/design changes are included.

Why:
PageSpeed showed desktop 99 with ~0.9s LCP, but mobile 75 with 44.5s LCP
and ~11.5 MB of estimated image-delivery savings.

Note:
Supabase Storage Image Transformations must be enabled for the optimized
mobile cover path to resize images. The project is already on Supabase Pro,
where image transformations are supported.
