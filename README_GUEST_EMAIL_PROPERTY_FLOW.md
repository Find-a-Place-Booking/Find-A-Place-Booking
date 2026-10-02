# Find A Place Booking — Guest Emails Property Flow v2

This overlay contains the complete property-first Guest Emails flow plus the styling cleanup.

## What changed
- Guest Emails opens to a clean property list, similar to Rates & Fees.
- Each property opens its own guest-email setup page.
- Pre-arrival and post-stay email setup use property-specific templates.
- Guest/reservation fields continue to auto-fill from the existing automation engine.
- Access code and arrival notes remain reservation-specific and are inserted only into that reservation's email.
- Upcoming stays are full-width cards instead of the cramped two-column review layout.
- Inputs, selects, textareas, status sections, action rows and mobile layouts now use a dedicated Guest Emails CSS module.
- Property cards have cleaner email status and guest-access metrics.

## Database / delivery behavior
No new migration is required for this overlay. It continues using the existing:
- host_guest_email_rules
- reservation_guest_instructions
- runDueHostGuestAutomations delivery engine
- existing host automation cron / Resend delivery path

## Files
- app/host/guest-emails/page.tsx
- app/host/guest-emails/[slug]/page.tsx
- app/host/guest-emails/actions.ts
- app/host/guest-emails/guest-emails.module.css

## Verification
The changed TS/TSX files passed an isolated strict TypeScript check using TypeScript 5.8.3.

Nothing in this package was pushed to GitHub or applied to Supabase by ChatGPT.
