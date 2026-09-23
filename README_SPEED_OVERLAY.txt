Find A Place Booking — Speed / Mobile Performance Overlay

This overlay is designed to drop over the current project root. It keeps the existing visual design and booking/payment behavior intact while reducing unnecessary first-load work.

Included optimizations
- Defers large hero MP4 playback until after the page load/idle window so text, layout, search and primary images can render first.
- Keeps poster images visible while hero video is waiting to start.
- Honors browser Data Saver and prefers-reduced-motion by leaving the poster in place instead of downloading/playing the hero video.
- Defers Mapbox initialization until the map is near the viewport and the browser has an idle window.
- Prevents expensive speculative Next.js route prefetches for stay search/detail links.
- Converts homepage destination photo cards to Next/Image so those remote images are responsive, optimized and lazy-loaded.
- Corrects stay-type image sizing hints on mobile from 100vw to 50vw.
- Lazy-loads non-critical property, host-profile, story and map-popup images.
- Gives the above-the-fold featured/property main image explicit high fetch priority.
- Splits the homepage property-card save-heart state into a tiny client component so the whole card does not need hydration there.
- Filters fixed destination + guest-count search criteria on the server before serializing search inventory to the browser; interactive chips/sorting remain client-side.
- Preserves the prior About featured-card change: no “Arkansas first” label on that card, and its heading/copy remain admin-editable while the image stays fixed.

Files are additive/replacements only. No package changes or new dependencies are required.

Supabase note
The included 20260923055000_about_featured_card_content.sql migration is the same idempotent migration from the previous About-card overlay. If it has already been applied, re-running the migration file is safe because it uses ON CONFLICT handling.

Validation performed
- All TypeScript/TSX files in this overlay were syntax-transpiled with TypeScript 5.8 without errors.
- The overlay intentionally does not alter Stripe, booking, taxes, calendars, host payouts, checkout logic or reservation state.
