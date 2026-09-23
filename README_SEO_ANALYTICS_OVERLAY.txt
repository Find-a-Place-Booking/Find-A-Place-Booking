Find A Place Booking — SEO + Vercel Analytics + Speed Overlay

This is cumulative with the earlier speed/About overlay. Drop these files over
the project root.

SEO / indexing:
- Canonical site base is https://findaplacebooking.com
- Optional future override: NEXT_PUBLIC_CANONICAL_SITE_URL
- Adds /robots.txt
- Adds /sitemap.xml
- Sitemap automatically includes every property returned by public_listing_index
- Adds canonical metadata to primary public pages
- Adds dynamic title/description/canonical metadata to every property page
- Adds WebSite + Organization schema
- Adds LodgingBusiness structured data to property pages
- Noindexes admin, host portal, auth, checkout, trip, booking and other private flows
- Legacy /who-we-arewhat-we-do points search engines to /about

Vercel:
- Adds @vercel/analytics 2.x
- Adds @vercel/speed-insights 2.x
- Page views are collected only for public pages
- Private/account/checkout/trip/API paths are excluded from analytics
- Public query strings are stripped before analytics are sent, so destination/date
  search parameters are not sent to Vercel Analytics
- Speed Insights uses the same private-route filtering

Custom events (no guest PII):
- property_click
  * automatically applies to all PropertyCard instances, including future properties
  * home featured property
  * search results
  * Mapbox popup property clicks
- stay_save_toggle
- search_submitted
  * only booleans / guest bucket, not destination text or dates
- collection_click
- destination_click
- map_toggle
- host_cta_click
- checkout_started
  * property slug + test/live only; no dates, guest name/email/phone or reservation id

IMPORTANT after applying:
1. Run:
   npm install

   This installs the two Vercel packages and updates package-lock.json.

2. In the Vercel project dashboard enable:
   - Web Analytics
   - Speed Insights

3. Deploy.

4. Verify:
   https://findaplacebooking.com/robots.txt
   https://findaplacebooking.com/sitemap.xml

5. In Vercel Analytics, custom events will begin appearing from production
   traffic after Web Analytics is enabled.

Future canonical-domain change:
- Preferred: set NEXT_PUBLIC_CANONICAL_SITE_URL to the new https:// domain.
- Or change the fallback in lib/seo.ts.

No payment processing, Stripe routing, reservation payment logic, Supabase
financial records, or connected-account logic is changed by this overlay.
