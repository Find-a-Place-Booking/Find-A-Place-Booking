Find A Place Booking — Milestone 9B.1 hardening overlay
Baseline: 841d98c — Calander Initial Commit

1. Extract this ZIP into the existing repository root and allow folders/files to merge.
2. Apply ONLY:
   supabase/migrations/20260914001500_calendar_hardening_performance.sql
   (Migration 014 must already be applied. Do not rerun 001–014.)
3. Run:
   npm run typecheck
   npm run build
   npm run dev
4. Open /api/health/supabase and confirm schema:
   calendar-availability-hardening-v1
5. Follow docs/APPLY_MILESTONE_9B_1.md for the calendar/security/full-site regression.
6. Only after local acceptance, commit and push the 9B.1 checkpoint.

This overlay contains no Stripe/Square/live-payment implementation and no secrets.
