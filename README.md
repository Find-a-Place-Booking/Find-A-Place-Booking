# Find A Place Booking — Production Conversion

This repository is the production build for **Find A Place Booking: Stays in Arkansas, Missouri & Beyond**.

The approved visual language from the original presentation build is being preserved while presentation-only behavior is replaced milestone-by-milestone with real production systems.

## Current milestone

**Milestone 3 — Supabase application foundation**

The Step 2 production shell remains visually intact. Milestone 3 adds the first real infrastructure boundary: Supabase browser/server client factories, environment-safe configuration, a source-controlled foundation migration, and a non-sensitive connection health check.

It deliberately does **not** wire real signup/login, host CRUD, property inventory, bookings, calendars, email or payments yet.

See [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) for the authoritative technical handoff and [`docs/APPLY_MILESTONE_3.md`](docs/APPLY_MILESTONE_3.md) for the exact application/verification sequence.

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

With the Milestone 3 Supabase migration and `.env.local` configured, also open:

`http://localhost:3000/api/health/supabase`

Then regression-check the verified Step 2 guest, host and admin shell before committing the milestone.

## Environment configuration

Copy `.env.example` to `.env.local` and provide the dedicated Find A Place Booking Supabase URL plus publishable key.

Never commit `.env.local`, API keys, service-role/secret keys, payment credentials or other secrets.

Email sender/domain values remain environment-driven so development can use the temporary Resend domain and production can later switch to the Find A Place Booking domain without rewriting routes.

## GitHub / Vercel workflow

- Git is used continuously for known-good checkpoints.
- Local development remains the primary environment until hosted behavior is specifically required.
- Do **not** deploy to Vercel merely because a milestone is committed.
- Payment processors remain in test/sandbox mode until the later live-money readiness gate is explicitly approved.
