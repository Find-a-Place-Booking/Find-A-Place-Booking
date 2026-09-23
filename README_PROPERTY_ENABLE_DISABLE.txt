Find A Place Booking — Host Property Enable / Disable

This ZIP is cumulative with the previous property-setup/pricing package.

NEW HOST CONTROL

Published properties now have a "Disable listing" action on:
- Host > Properties list
- Individual property page

Disabled properties use the existing PAUSED lifecycle status.

When disabled:
- the property immediately drops out of public_listing_index
- its public /stays/[slug] detail no longer resolves
- it drops out of public map results
- it drops out of sitemap listing results after revalidation
- existing reservations remain intact
- availability/calendar records remain intact
- payment history remains intact
- the property is NOT archived or deleted

A disabled property shows "Enable listing".

Enable uses the existing host_publish_property() publication path, so it
rechecks the same required listing fields and LIVE Stripe readiness before
returning the property to PUBLISHED.

This means a host cannot accidentally re-enable a listing that is no longer
booking-ready or whose live payment account is no longer ready.

SERVER / SECURITY
- New RPC: public.host_pause_property(uuid)
- OWNER/MANAGER property access is required through can_manage_property()
- public/anon execution revoked
- authenticated execution granted
- pause and re-enable are audit/review-history visible

PUBLIC MARKETPLACE SAFETY
The existing public listing RPCs already require:
  properties.status = 'PUBLISHED'

Therefore PAUSED removes the property from marketplace discovery without any
special public-side filtering code.

FILES
- app/host/properties/page.tsx
- app/host/properties/properties.module.css
- app/host/properties/[slug]/page.tsx
- app/host/properties/actions.ts
- supabase/migrations/20260923193748_host_pause_resume_listing.sql

LIVE DATABASE
Migration 20260923193748 host_pause_resume_listing has already been applied to
the current production Supabase project.

RECOMMENDED TEST
1. Use a published test property.
2. Open Host > Properties and click Disable listing.
3. Confirm its status becomes Disabled / PAUSED.
4. Confirm it disappears from /stays and public map/search.
5. Confirm existing reservations and calendar events are still present.
6. Click Enable listing.
7. Confirm the publication checks pass and it returns to PUBLISHED.
8. Confirm it reappears in /stays and public map/search.
9. Disconnect or invalidate the live payment account in a safe test environment
   and confirm Enable is rejected rather than exposing an unbookable listing.
