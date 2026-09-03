# Find A Place Booking — Production Conversion

This repository is the production build for **Find A Place Booking: Stays in Arkansas, Missouri & Beyond**.

The approved visual language from the original presentation build is being preserved while presentation-only behavior is replaced milestone-by-milestone with real production systems.

## Current milestone

**Milestone 3.5 — UI/UX stabilization before authentication**

Milestone 3 is verified at Git checkpoint `43dbf81`. This UI pass locks the main guest/host/admin interaction patterns and mobile behavior before authentication and database-backed CRUD are built underneath them.

This milestone does **not** add auth, property persistence, bookings, live payments, calendar sync or a new Supabase migration.

See [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) for the authoritative technical handoff and [`docs/APPLY_MILESTONE_3_5.md`](docs/APPLY_MILESTONE_3_5.md) for the exact application/verification sequence.

## Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run typecheck
npm run build
```

Also verify:

`http://localhost:3000/api/health/supabase`

Then regression-check the guest, host and admin experience at desktop and mobile widths before committing the milestone.

## Environment configuration

Copy `.env.example` to `.env.local` and provide the dedicated Find A Place Booking Supabase URL plus publishable key.

Never commit `.env.local`, API keys, service-role/secret keys, payment credentials or other secrets.

Email sender/domain values remain environment-driven so development can use the temporary Resend domain and production can later switch to the Find A Place Booking domain without rewriting routes.

## GitHub / Vercel workflow

- Git is used continuously for known-good checkpoints.
- Local development remains the primary environment until hosted behavior is specifically required.
- Do **not** deploy to Vercel merely because a milestone is committed.
- Payment processors remain in test/sandbox mode until the later live-money readiness gate is explicitly approved.
