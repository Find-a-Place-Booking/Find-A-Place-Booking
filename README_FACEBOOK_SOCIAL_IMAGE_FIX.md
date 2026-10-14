# Facebook / social stay thumbnail fix

This overlay fixes the issue shown by Meta Sharing Debugger:

> Corrupted Image — Provided og:image URL could not be processed as an image.

## What was wrong

There were two separate crawler-facing problems.

1. Production is served on `www.findaplacebooking.com`, but the canonical helper
   defaulted to `https://findaplacebooking.com`. That made `og:url` and the
   generated `og:image` URL take an unnecessary 308 redirect before reaching
   the real production hostname.

2. The social-image endpoint proxied the Supabase image blob straight back to
   the crawler and manually set Content-Length/MIME headers. Browsers are
   forgiving here; Meta's image parser is not. The debugger was reaching the
   new endpoint but rejecting what came back as a usable image.

## Fix

- Canonical/public absolute URLs are normalized to the final `www` hostname.
- The endpoint still uses the property's actual first/primary photo.
- The original private Storage image is downloaded server-side.
- Its real byte signature is checked (PNG/JPEG/WebP/GIF).
- Next ImageResponse decodes it and emits a fresh, real **1200x630 PNG**.
- The route now always returns `Content-Type: image/png`.
- Manual `Content-Length` is removed so Vercel/Next owns the response framing.
- HEAD is supported for crawlers that probe the asset before GET.
- No logo fallback is used when the stay has a real photo.

No database migration is required.

## After deployment

In Facebook Sharing Debugger:
1. Enter the public `www.findaplacebooking.com/stays/...` URL.
2. Click **Scrape Again**.
3. If Meta still shows an old cached preview, click **Scrape Again** a second
   time. The canonical/og:image hostname is now different from the bad cached
   non-www URL, which also helps force a clean fetch.

The expected `og:image` URL should start with:
`https://www.findaplacebooking.com/api/public/stay-social-image/...`

The endpoint response should be a 1200x630 PNG.
