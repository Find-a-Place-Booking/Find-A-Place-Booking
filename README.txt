FIND A PLACE BOOKING — DIRECT OVERLAY (Nov 9, 2026)

Extract the contents of this ZIP directly into your Find-A-Place-Booking
repository root (the folder containing package.json). Choose YES to replace
components/Header.tsx if prompted. No Python scripts or patch commands.

FILES:
  components/Header.tsx
  components/HeaderDesktopPolish.module.css
  supabase/migrations/20261110050100_intro_offer_confirmed_booking_guard.sql

The header shows navigation links on desktop/laptop. A two-row layout is
used from 921–1550 CSS px; wider desktop uses the existing one-row layout.
Screens <= 920px keep the existing mobile drawer.

SUPABASE: The new-host 25% promotion migration AND its first-three-confirmed-
bookings guard have ALREADY BEEN APPLIED to production Supabase by ChatGPT and
verified. The SQL file here is only to keep your repository migration history
in sync. Do not manually paste/run it against production again.

This overlay does not change booking, Stripe, calendar, or tax code.

After extracting and checking your git diff, run your usual project checks,
commit and push to Vercel. This overlay is not itself deployed.
