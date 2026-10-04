Find A Place Booking - Facebook property preview fix

Additive file:
  app/stays/[slug]/opengraph-image.tsx

What it does:
- Gives every stay page a native Next.js Open Graph image.
- Produces a fixed 1200x630 PNG for Facebook/social crawlers.
- Reads the cover photo server-side from private Supabase storage.
- Uses the Supabase image transform when available.
- Falls back to the original private image and normalizes it through ImageResponse.
- Falls back to a branded Find A Place image if the listing has no usable cover.
- Adds property name/location to the preview image.
- Does not touch booking, availability, Stripe, calendar, or normal property gallery code.

After deployment:
Facebook may still have the old preview cached for URLs it has already scraped. Use the Facebook Sharing Debugger and choose Scrape Again for any stale property URL.
