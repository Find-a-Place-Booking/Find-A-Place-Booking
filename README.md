# Find A Place — make Facebook share use the MAIN listing photo

Overlay prepared for the live Find A Place Booking Next.js 16 repository on 2026-10-14.

## Install

Extract this ZIP to your **repository root**, preserving folders, overwrite only these two existing files:
- `lib/public/serve-stay-social-image.ts`
- `app/stays/[slug]/opengraph-image.tsx`

Then run `npm run typecheck && npm run build`, and commit/push the two files. Vercel deploys when the push succeeds. No SQL, pricing, booking, calendars or payments changes.

## Why this works

The host's `Make primary` function orders photos by `property_images.sort_order`. The `public_listing_detail` RPC returns `image_paths` ordered by `sort_order, created_at`. Index 0 is the photo shown first in the public listing's gallery.

Previously the social endpoint tried up to eight photos and **skipped** to the next whenever the primary couldn't be rendered (for example if its original was too large). The replacement always downloads the first/primary photo and converts that image to a 1200x630 JPEG with Sharp; Next.js 16.3.5 already has `sharp@0.35.4` in its package lock as a Next.js optional dependency. The code does not try photo #2 if the main image fails; it returns a retryable 503 rather than silently selecting the wrong photo. PNGs and larger JPGs are converted reliably.

Next.js file-based `opengraph-image.tsx` takes precedence over the `generateMetadata` Open Graph image config in the page. The updated file uses `generateImageMetadata` with a hash of the primary image storage path as `id`, so when the host changes their primary photo the generated Facebook image URL changes, helping to clear stale image caches.

## Verify after deployment

1. Open one published stay and confirm photo #1 is the intended main photo. If not, use host Photo order -> Make primary to select it.
2. Visit `https://www.findaplacebooking.com/stay-share/<slug>` and confirm it shows the **same photo as #1**. It should respond HTTP 200 `image/jpeg`, `X-Find-A-Place-Social-Image: primary-only-v4`.
3. Open `https://developers.facebook.com/tools/debug/` with the stay URL, choose **Scrape Again**, confirm the selected og:image matches photo #1. Facebook might continue showing an earlier cached preview until a rescrape.
4. Change a test listing's primary photo, confirm the generated Open Graph URL contains a different `?id=<hash>` value, rescrape and restore its desired cover.

If the image endpoint responds HTTP 503, inspect `[public stay share] main photo unavailable` logs: we deliberately did NOT substitute a different photo. Confirm Sharp was installed by Vercel; it should be present via Next.js' optional dependencies. In a custom/npm omit-optional setup, add `sharp@0.35.4` as a direct dependency before deploying.

## Safety

Two code files, no SQL migration, and no changes to the host photo order, content, reservations or money flow. This patch is separate from the earlier homepage map/search and email patches.
