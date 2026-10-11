Find A Place Booking — Share + Social Preview + Mobile Map + Host Help polish

Drop these files into the repo at the same paths, replacing the existing files, then deploy.

Files changed
- components/PropertyActions.tsx
- app/api/public/stay-social-image/[slug]/route.ts
- app/stays/[slug]/opengraph-image.tsx
- components/StayMap.tsx
- components/StayMap.module.css
- components/HostHelpAssistant.tsx
- components/HostHelpAssistant.module.css

What this fixes / improves

1. One-tap Copy link
- Removes the native share-sheet detour from the main stay action.
- Clicking Copy link writes the stay URL directly to the clipboard.
- Includes a fallback copy method for browsers/in-app browsers where Clipboard API is unavailable.
- Shows Link copied or a short copy-failed state.

2. Stable property photo for shared links
- The stay social-image endpoint no longer redirects Facebook/Messenger crawlers to a short-lived signed Supabase URL.
- Find A Place now serves the property image bytes from the stable Find A Place social-image URL.
- Keeps the property primary photo as first choice and the Find A Place seal only as fallback.
- The Next.js opengraph-image route uses the same stable image loader for consistency.

3. Mobile map cleanup
- Larger touch targets for price pins/clusters.
- Removes desktop zoom controls on touch layouts to free map space.
- Single-stay popup becomes a compact horizontal card on mobile with photo, property name, price/rating and View stay CTA.
- Cluster popup is shorter and easier to use on small screens, with a capped list, compact cards and full-width zoom button.
- Mobile popup opening recenters the selected point so the card is less likely to be clipped.
- Cluster count labels are clickable, not only the circle underneath.
- Broken map thumbnails fall back to the Find A Place seal instead of showing a broken image.

4. Better contextual host help
- Help tips default on for hosts who have not explicitly hidden them.
- Critical areas are visually marked Important on this screen.
- Adds practical bullets to Calendar, Integrations, Payments, Guest emails, Properties, Reservations, and Booking recovery.
- Adds stronger onboarding guidance for Photos, Taxes, Policies, Calendar, Payments and Review.
- Booking recovery now has its own contextual explanation instead of falling back to the generic host dashboard tip.
- Existing Hide tips preference remains respected.

Validation
- All TS/TSX files in this overlay were parsed/transpiled with TypeScript successfully.
- No database migrations or environment-variable changes are required.
- No booking/payment/calendar routing was changed.

GitHub write note
- The connected GitHub integration still returns 403 Resource not accessible by integration for repo writes, so this overlay was prepared instead of falsely claiming a push.
