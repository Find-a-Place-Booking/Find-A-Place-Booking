# Find A Place Booking — Production Conversion Baseline

This repository is the production-conversion starting point for **Find A Place Booking: Stays in Arkansas, Missouri & Beyond**.

The current UI is the approved near-production demo experience. Production work will replace presentation data and simulated behavior milestone-by-milestone while preserving the existing visual integrity and guest/host/admin UX wherever possible.

## Current milestone

**Milestone 1 — production repository bootstrap**

The front end is intentionally unchanged at this checkpoint. Demo listings and simulated dashboard data remain temporarily so the exact baseline can be verified after moving the source into the dedicated GitHub repository.

See [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) for the authoritative technical handoff, build rules, infrastructure decisions, environment-variable names, known demo-era items and the next exact milestone.

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

## Environment configuration

Copy `.env.example` to `.env.local` only when a milestone begins using environment-backed services.

```bash
cp .env.example .env.local
```

Never commit `.env.local`, API keys, service-role keys, payment credentials or other secrets.

Email sender/domain values are designed to be environment-driven so development can use the temporary Resend domain and production can switch domains later without rewriting application routes.

## GitHub / Vercel workflow

1. Push this folder to the dedicated repository under the **Find-a-Place-Booking** GitHub organization.
2. Confirm the repository checkout works locally before beginning Milestone 2.
3. Create/record a known-good Git checkpoint.
4. Do **not** deploy to Vercel simply because the repository exists. Development remains local-first until hosted behavior is specifically needed.
5. Live payment credentials and live-money testing are explicitly out of scope until the later production-readiness gate.
