# Find A Place Booking

This branch contains pre-live hardening pass **026** for a controlled first-property pilot. It keeps live charging closed by default while making the TEST path suitable for full end-to-end rehearsal.

## What 026 adds

- explicit TEST/LIVE separation for Stripe accounts, assignments, reservations, payments, refunds, disputes, and processor events;
- a database-enforced per-property live checkout allowlist;
- one atomic, idempotent Stripe payment attempt per reservation/environment;
- destination-charge refunds with host transfer reversal and verified application-fee reconciliation;
- signed Stripe webhooks with idempotent event processing, refund reconciliation, dispute records, and booking notifications;
- Turnstile protection for public hold creation;
- scheduled iCal polling plus a fail-closed feed refresh immediately before each hold;
- date-aware public search results and canonical availability enforcement;
- deployment-safe host image upload limits;
- a health endpoint that verifies the 026 schema marker.

## Apply and verify

1. Apply all Supabase migrations through:

   `supabase/migrations/20260918002600_pre_live_hardening.sql`

2. Copy `.env.example` to your deployment settings and supply real secrets. Keep `BOOKING_CHECKOUT_ENABLED=false` until TEST verification is complete.

3. Run:

   ```bash
   npm ci
   npm run typecheck
   npm run build
   ```

4. Confirm `/api/health/supabase` returns:

   ```json
   {
     "ok": true,
     "pre_live_schema": "pre-live-hardening-026-v1",
     "live_money_enabled": false
   }
   ```

5. Follow the release checklist in [`docs/PRE_LIVE_HARDENING_026.md`](docs/PRE_LIVE_HARDENING_026.md).

## Live-money invariant

LIVE checkout requires all of the following at the same time:

- matching Stripe live secret and publishable keys;
- all required production dependencies from `.env.example`;
- a LIVE Stripe payout account in READY state for the property;
- `properties.live_checkout_enabled = true`, changed only by a SUPER_ADMIN or OPERATIONS_ADMIN;
- a reservation with a real, snapshotted `CALCULATED` lodging-tax result.

The repository does **not** guess an Arkansas lodging tax code or rate. Stripe Tax registration, product tax treatment, local jurisdiction coverage, and refund/reversal behavior must be validated before enabling the first live property.
