# Find A Place Booking — Production Conversion

Production build for **Find A Place Booking: Stays in Arkansas, Missouri & Beyond**.

The approved demo visual language is being preserved while presentation-only behavior is replaced milestone-by-milestone with real systems.

## Current package

**Milestone 8 — property review, approval & publication foundation**

This package builds on the accepted Milestone 7 property CRUD + cleanup tree. Before applying it, create/push a known-good Step 7 Git checkpoint.

Milestone 8 adds:

- host submission of complete property drafts;
- `PENDING_REVIEW` / `CHANGES_REQUESTED` / `APPROVED` / `PUBLISHED` / `PAUSED` lifecycle;
- Operations/Super Admin review controls;
- separate approval and publication actions;
- append-only property review history + audit events;
- host edit/image locking while a listing is under review, approved or published;
- guest-safe public catalog/detail RPCs that never expose private address/contact fields;
- published property visibility on `/`, `/stays` and `/stays/[slug]`;
- public current/old slug resolution;
- signed public image access only for actually published properties;
- explicit non-bookable/no-availability public state while booking/calendar systems remain disconnected;
- no fake map pins before the real interactive map is implemented.

It still does **not** connect calendars, calculate live availability, create reservations, accept checkout, process payments, calculate/remit taxes or send operational booking email.

See:

- `docs/PROJECT_STATE.md` — authoritative project handoff.
- `docs/APPLY_MILESTONE_8.md` — migration/testing/checkpoint sequence.
- previous milestone docs — retained regression history.

## Local verification

```bash
npm run typecheck
npm run build
npm run dev
```

Also verify:

`http://localhost:3000/api/health/supabase`

Expected schema after migrations 009 + 010: `property-review-publication-v1`.

Do not deploy to Vercel merely because the milestone is committed. Development remains local-first until hosted behavior is specifically required.

## Environment

Use `.env.local` for real local values and never commit it. Supabase/Resend/payment secrets and banking data must never be checked into Git.

Application-level email sender/domain configuration remains environment-driven so development can use `hometownwebservicesar.cc` and production can later change domains without rewriting email routes.
