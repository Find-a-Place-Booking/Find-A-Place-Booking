Find A Place Booking — Facebook stay thumbnail fix

Problem:
Stay URLs were still sometimes sharing the Find A Place logo instead of the stay's
actual primary/cover photo.

Root cause addressed:
The social-image helper generated a short-lived signed Supabase URL and then made
a second server-side fetch to that signed URL. Any failure in either the transformed
or original signed-url fetch dropped all the way to the brand logo. Facebook could
then cache that incorrect logo against the stay.

This overlay changes that behavior:
1. The server retrieves the primary property image directly from the private
   property-images bucket with the authenticated Supabase Storage client.
2. It first requests a 1200x630 social-card transform.
3. If transformations are unavailable, it returns the actual original primary photo.
4. If a stay has a real photo but Storage is temporarily unavailable, the endpoint
   returns 503/no-store instead of the Find A Place logo, so crawlers retry rather
   than caching the wrong thumbnail.
5. The response includes a concrete image MIME type, content length, nosniff header,
   and long CDN cache headers after a successful image response.
6. Both the explicit /api/public/stay-social-image/[slug] route and Next's
   /stays/[slug]/opengraph-image metadata route use the same corrected behavior.

Files:
- lib/public/stay-social-image.ts
- app/api/public/stay-social-image/[slug]/route.ts
- app/stays/[slug]/opengraph-image.tsx

No database migration or environment variable change is required.

Important Facebook cache note:
Facebook caches share metadata aggressively. After this is deployed, links Facebook
already scraped with the old logo may need one "Scrape Again" in Facebook's Sharing
Debugger before the corrected thumbnail appears immediately. New/uncached stay URLs
should use the actual primary photo on their first scrape.
