Find A Place Booking - Facebook social thumbnail fix (14 October 2026)

WHY:
1. app/robots.ts disallows /api/, but page metadata used /api/public/stay-social-image/[slug].
2. The image API wrapped private Storage photos inside Next ImageResponse (Satori), which adds an unnecessary rendering/decoding layer. Facebook reports the endpoint is a corrupted image.
3. App layout falls back to the Find A Place seal when no usable listing image is fetched.

WHAT THIS PATCH DOES:
- Adds /stay-share/[slug] outside robots-blocked /api/ and points stay page metadata at it (new URL bypasses cached failed thumbnail).
- Directly returns resized private Storage image bytes as JPEG or PNG; does NOT generate an ImageResponse or base64 data URL.
- Forces Supabase transformation format='origin' so WebP conversion isn't forced, and checks actual byte signatures before setting Content-Type.
- Preserves old /api/public/stay-social-image/[slug] for previously scraped URLs, explicitly allowing it in robots.txt.
- Makes the other Next opengraph-image.tsx route use the same direct-binary helper.
- Adds explicit 1200x630 openGraph dimensions; removes the misleading fallback-to-logo from stay metadata.

TO INSTALL:
1. Extract this ZIP.
2. Place extracted folder content somewhere accessible from your local Find A Place Booking repo.
3. In the repo root, run:
     node /path/to/extracted/apply-facebook-og-fix.mjs
4. Run: npm run build
5. Review and commit: git diff; git add app lib/public/serve-stay-social-image.ts; git commit -m "Fix Facebook property image previews"; git push origin main
6. Wait until the new Vercel deployment is READY.
7. Visit: https://www.findaplacebooking.com/stay-share/livingston-junction-cabooses-and-cabins
   Must display the listing image, not a logo or error.
8. In Facebook Sharing Debugger, scrape the PROPERTY URL again and verify og:image now contains:
   https://www.findaplacebooking.com/stay-share/livingston-junction-cabooses-and-cabins
   and the screenshot preview is the property's photo.
9. Optionally verify other listings, especially Lil' Rustic and Oak Ridge Cabin.

If GET returns 503 after deploy, inspect Vercel logs for '[public stay share]'; the route now logs source errors without claiming that a non-image response is a PNG.

This patch is NOT applied automatically. GitHub connector returned 403 Resource not accessible by integration when writing app/robots.ts.

AUTOMATED FOLLOW-UP TEST (AFTER DEPLOYMENT):
  node /path/to/extracted/verify-facebook-share.mjs
  It tests HTML OG URL, image HTTP status, actual PNG/JPEG bytes and size for Livingston, Lil Rustic and Lone Cedar Oak Ridge.
