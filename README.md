# Find A Place — Admin Stripe Connect refresh patch

This overlay is based on `main` commit `3c84ae22041fbcc7c98f52c20282545c5b8afea4` and the **simple V2** publishing overlay.

## Installation

Extract ZIP over repository root and push normally. This replaces ONLY:

- `app/admin/publishing/actions.ts`
- `app/admin/publishing/[propertyId]/page.tsx`

No database migration, environment variables, booking, Stripe payment processing, tax, calendar or host account configuration changes.

## What it adds

The admin publishing detail screen shows stored Stripe card-payments status (if unavailable or not ready) and a **Refresh Stripe status** button. It calls the SAME server-side `syncStripePaymentAccount` function the host uses. `SUPER_ADMIN` and `OPERATIONS_ADMIN` only, admin cookie authorization, and `LIVE` account selected from the host organization. The saved account is updated ONLY from Stripe's current API response. It never changes account routing or enables Stripe capabilities manually.

## How to use

1. Deploy overlay.
2. Admin > Get listings live > The Cabin at Dobbers Corner.
3. Click **Refresh Stripe status**.
4. If Stripe returns READY, the publishing checklist updates. If still restricted, review the outstanding Stripe requirements with the host. Connected does not mean live card payments are active.

## Safety

Do NOT manually set `charges_enabled` or `payouts_enabled` true in Supabase. This would permit bookings that Stripe may reject. The backend publication guard is unchanged.

## Known limitation

No live authenticated Stripe refresh was possible from this session. The available Stripe connector lacks permission to read the host account. Deploy and click the admin refresh button using the site's own configured Stripe credentials.
