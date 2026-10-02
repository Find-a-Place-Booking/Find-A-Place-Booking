Find A Place Booking — Calendar price/unit isolation fix

Base reviewed: current GitHub main, October 2, 2026.

This overlay fixes the remaining host-calendar problem where switching between
properties could show the selected property's title while retaining/mixing price
points from another unit.

WHAT CHANGED

1) lib/host/calendar.ts
- The host calendar no longer uses resolve_unit_pricing_days for its DISPLAY array.
- It now loads base rates, rate rules, stay rules, and default minimum stay using
  queries explicitly filtered by the currently selected unit_id.
- The server then resolves the 42 visible calendar days from ONLY those rows.
- Rate-rule precedence mirrors the authoritative pricing resolver:
  highest priority -> shortest date range -> newest rule.
- Friday/Saturday weekend handling is preserved.
- Public-special badges and date-specific minimum stays are preserved.

This changes only what the host calendar displays. Checkout/booking pricing still
uses the authoritative database pricing functions exactly as before.

2) app/host/calendar/page.tsx
- Keeps the existing unit/month keying from the prior fix.
- Forces the host calendar route to render dynamically with no fetch cache so a
  property switch cannot reuse stale server pricing data.

LIVE DATA CHECK BEFORE BUILDING THIS FIX
- Carol's Cozy Cottage:
  Fall weekdays $110, Fall Fri/Sat $125.
- Rhonda's Romantic Retreat:
  Fall weekdays $125, Fall Fri/Sat $145.
- The database therefore has distinct pricing; the mixing was in the host calendar
  display path, not the stored rates.

NOT CHANGED
- guest checkout
- quote_unit_stay / booking pricing
- Stripe or payment flow
- availability blocking
- ResNexus / ThinkReservations sync
- rate data in Supabase
- database schema or migrations

No Supabase migration is required.
