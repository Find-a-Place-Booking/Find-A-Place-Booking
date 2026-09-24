Find A Place Booking - Google favicon discovery fix

What this does:
- Keeps the existing Find A Place seal as the favicon artwork.
- Adds a stable, root-level /favicon.ico URL that serves that exact 720x720 PNG.
- Explicitly declares favicon type and size in Next.js metadata.
- Keeps the existing brand image as a secondary icon and Apple touch icon.

Why:
Google Search can show the generic globe when it has not discovered/processed a
site favicon yet. A stable root-level favicon URL plus an explicit <link rel="icon">
makes the favicon easier for crawlers and browsers to discover.

After deployment:
Use Google Search Console > URL Inspection on https://findaplacebooking.com/
and request indexing. Google can still take several days or longer to refresh
the favicon in search results.
