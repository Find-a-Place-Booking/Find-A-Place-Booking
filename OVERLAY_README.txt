Find A Place Booking - AM/PM + Host Crash-Recovery Autosave Overlay

This ZIP contains the actual replacement/new source files. It is not an apply script.
Overlay the folders into the repository root.

Changed existing files:
- app/layout.tsx
- app/host/layout.tsx

New files:
- components/StandardTimeEnhancer.tsx
- components/HostDraftPersistence.tsx

What it does:
- Replaces visible native time controls with 12-hour AM/PM selectors while preserving the original HH:mm value used by the app/backend.
- Converts user-visible 24-hour time text (for example 15:00 -> 3:00 PM) without changing stored data or ISO timestamps.
- Runs across the site so host, guest, and admin-visible times use standard AM/PM presentation.
- Autosaves host form fields to browser storage as the host types/changes fields, scoped to the signed-in host and current route.
- Restores saved form progress after refresh, accidental tab close, browser restart, or a crash.
- Handles dynamically appearing form fields and calendar-preference button choices.
- Excludes passwords, file inputs, hidden inputs, payment/card/token/secret fields, and Stripe/payment-like fields from draft storage.
- Drafts expire after 7 days.

No Supabase migrations.
No booking/payment/calendar routing changes.
No stored time-format changes.
