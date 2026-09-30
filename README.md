# Find A Place Booking — Mobile property-card layout fix

This overlay changes only:

- `app/mobile-public-width-fix.css`

On screens 700px wide and under, homepage/featured stay cards now reflow to a
single full-width column instead of preserving or inheriting a compressed
desktop composition.

It explicitly covers both the current `.home-property-grid` and the older
`.featured-grid` layout so the first/wide card cannot remain large while the
other cards get squeezed beside it.

Desktop/tablet layouts above 700px are unchanged. No listing data, booking,
Stripe, calendars, ResNexus, host tools, or database logic is changed.
