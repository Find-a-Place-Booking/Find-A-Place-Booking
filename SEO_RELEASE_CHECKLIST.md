# Search discoverability: what this release solves and what it cannot

**Ships after GitHub push**: six destination pages with distinct copy and actual currently published listings; a destination hub; sitewide footer and Find a Stay links; a sitemap covering published properties, destination hubs and nearby experiences; IndexNow with a public proof key and a `CRON_SECRET`-guarded daily feed of newly changed public listings.

**Still needed outside code**: submit/verify Google and Bing sitemaps, fix the current production 403 errors that might block crawlers and visitors, verify IndexNow endpoint acceptance, and ask regional tourism-guide editors to place relevant editorial links from their existing guides to the right destination pages. Google Search Console has Google verification metadata configured in the root layout, but indexing and performance need manual monitoring.

**What not to do**: create a separate SEO page for every tiny place without unique useful information, exaggerate amenity or travel-distance claims, add unqualified `VacationRental` rich-result markup without Google partner eligibility, scrape/clone competitor descriptions, buy link schemes, or set `indexNow` acceptance equal to successful Google indexing. Google does not directly use IndexNow. 

Official references:
- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/appearance/structured-data/vacation-rental
- https://developers.google.com/hotels/vacation-rentals/dev-guide/onboarding
- https://www.indexnow.org/documentation
