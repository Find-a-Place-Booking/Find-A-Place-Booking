# Find A Place Booking — Production Conversion

Production build for **Find A Place Booking: Stays in Arkansas, Missouri & Beyond**.

## Current package

**Milestone 8 cleanup — admin navigation + consistency audit**

Baseline:

`00bb71d` — `feat: add property review and publication foundation`

This cleanup does not add a database migration or npm dependency. It keeps the accepted Step 8 property lifecycle intact while tightening the UI and code around it.

Changes include:

- Admin overview metric cards now work as redundant navigation where the matching admin destination exists.
- Listing-review and Published cards open the correct status-filtered property views.
- Partner-request navigation remains role-aware.
- Admin metric-grid CSS was consolidated so desktop/tablet/mobile breakpoints no longer compete with older milestone rules.
- Stale development/milestone copy was removed from host/public/admin screens where it no longer matched the current build.
- Next 16 dev type generation is included in `tsconfig.json`, preventing the framework from repeatedly patching the include list during local development.
- Public listing index image signing is limited to the three photos actually used by listing cards; full property detail still supports the gallery.

No calendar sync, availability, reservation, checkout, payment, tax, payout or live-money behavior is added here.

See:

- `docs/PROJECT_STATE.md` — current authoritative technical state.
- `docs/APPLY_MILESTONE_8_CLEANUP.md` — cleanup verification/checkpoint sequence.
- `docs/APPLY_MILESTONE_8.md` — original Step 8 lifecycle acceptance sequence.

## Local verification

```bash
npm run typecheck
npm run build
npm run dev
```

Health route remains:

`http://localhost:3000/api/health/supabase`

Expected schema: `property-review-publication-v1`.

Development remains local-first. Preserve the repository's existing `.git`, `.env.local` and `package-lock.json` when applying this package.
