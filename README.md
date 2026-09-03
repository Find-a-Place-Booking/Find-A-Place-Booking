# Find A Place Booking — Production Conversion

This repository is the production build for **Find A Place Booking: Stays in Arkansas, Missouri & Beyond**.

The approved visual language from the original presentation build is being preserved while presentation-only behavior is replaced milestone-by-milestone with real production systems.

## Current milestone

**Milestone 4 — Supabase authentication foundation**

Milestone 3.5 is verified at Git checkpoint `81346f6`. This pass adds real cookie-based Supabase Auth, host account creation/sign-in/sign-out, explicit internal admin authorization, session refresh and first RLS policies while preserving the stabilized UI.

This milestone does **not** add property persistence, host organizations, bookings, live payments or calendar sync.

See [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) for the authoritative technical handoff and [`docs/APPLY_MILESTONE_4.md`](docs/APPLY_MILESTONE_4.md) for the exact Supabase dashboard, migration and local verification sequence.

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
