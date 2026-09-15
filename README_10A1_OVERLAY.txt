Find A Place Booking — Milestone 10A.1 hardening overlay
Baseline: ecfca766

Apply only migration 017 on a database already current through 016.
Run npm run typecheck, npm run build, npm run dev.
Expected health schema: reservation-payment-hardening-v1.

Test reservation helpers now default disabled at PostgreSQL as well as the production UI.
See docs/APPLY_MILESTONE_10A_1.md before enabling them locally.

No live processor calls or secrets are included.
