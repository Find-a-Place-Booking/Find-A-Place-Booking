# Find A Place — Simple publishing UI (V2 replacement overlay)

Prepared November 5, 2026, for the Find A Place Booking GitHub repository. The last observed production deployment before this replacement was commit `3c84ae2` (READY).

## The problem and the change

The previous admin publishing screen mixed ready properties, incomplete host onboarding, technical calendar warnings and dozens of form controls. The updated interface prioritizes **Ready to publish**, **Need help** and **Paused** as clear selectable views. Each property shows its **main blocker**, not a giant error list. Opening the property gives plain-English issues with direct fix links; only the relevant editing sections open automatically. Other settings remain available under expandable sections.

The old host-assistance page also had one long form. It now has three small groups (property facts, rates/policy and contact information) and a separate action to prepare an unpublished property draft. Live calendar warnings are not mixed into publishing: use Admin → Calendars for those.

Read `docs/ADMIN_PUBLISHING_SIMPLE_FLOW.md` for all workflows and release checks.

## Installation

1. **Use this ZIP instead of the earlier `find-a-place-admin-speedrun-and-ical-log-cleanup-overlay-2026-11-05.zip`.** This ZIP is a complete replacement and includes the earlier necessary files.
2. Extract over the root of your Find A Place Booking repository, preserving folder paths.
3. Review changes, run `npm ci`, `npx tsc --noEmit`, and `npm run build`. Test with an authorized admin before committing to `main`.
4. Push to GitHub and confirm Vercel production shows the new commit. This ZIP has **not** been pushed by the assistant.

## Database status

The included migration source files describe the already-installed production database functions and policies. Their equivalents were applied in Supabase in the previous round, including admin publishing, assisted edits, host marketing opt-ins, photo registration and the routine iCal/PMS admin activity-log filter. **Do not execute them manually again** or blindly run a CLI migration batch against production. If using Supabase CLI, reconcile the remote migration history before applying further migrations.

No new database migration is required for this V2 UX change. No reservation, Stripe, tax or calendar code is modified.

## Rules that remain intact

- The server-side readiness RPC is authoritative; the front end cannot bypass a blocker.
- Host-owned Host Agreement/authority confirmations, Stripe account setup, tax responsibility and external calendar credentials still require legitimate host/provider actions.
- Admin saves and publication actions require an operations/super admin role and an audit reason.
- A paused listing stays separated from other ready listings and needs deliberate review before it goes live.
- Routine iCal and PMS auto-sync activity remains retained in backend history, but filtered from the human-readable Admin Activity Log. Existing calendars and diagnostics remain accessible.
- Marketing interest questions are kept separate from publication decisions.

## Verification completed

14 TypeScript/TSX source files passed syntax parsing, 11 focused mapping/order tests passed, new workflow shape checks passed and the ZIP integrity check passed. **A full Next.js build, visual review, and live publish flow are not yet tested.** Do not claim V2 is live until you push it and confirm Vercel.

## Rollback

If the new UI has any issues, revert only its GitHub commit. Production booking and database publishing checks were not changed by this UI replacement.

### Concurrency and rejected listings

To avoid overwriting a fresh host edit, the revised admin forms send only values changed from those displayed when the page opened. Previously rejected listings require review in the normal property workflow; they aren't presented as instantly publishable even if their technical requirements pass.
