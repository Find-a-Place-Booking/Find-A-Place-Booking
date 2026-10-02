# Find A Place Booking — Property Guest Email Flow

Base GitHub `main` checked before packaging:
`20d22354e51f19ee40ddb7cdec6cf73b559a62b5`

## What changes

- `/host/guest-emails` now mirrors the Rates & fees flow: hosts see their properties first.
- Clicking a property opens `/host/guest-emails/[slug]`.
- Each property gets a ready-made pre-arrival email setup.
- Guest/reservation information continues to fill automatically from the existing automation engine:
  - guest name
  - property name
  - check-in / checkout dates
  - confirmation number
  - host name/email/phone
  - guest My Trip link
- Access code and arrival notes are saved against the matching reservation and automatically inserted into that guest's email.
- Pre-arrival email defaults to 3 days before check-in at 10:00 local time and waits for an access code by default.
- A ready-made optional post-stay thank-you email is available on the property page.
- Existing template customization remains available under an advanced/collapsible editor.

## What does NOT change

- No Supabase migration is included or required.
- No existing reservation, property, host account, payment, calendar, or tax data is modified by this overlay.
- The existing `host_guest_email_rules` table is reused.
- The existing `reservation_guest_instructions` table is reused.
- The existing `runDueHostGuestAutomations()` delivery engine is unchanged.
- The existing host automation cron is unchanged.
- Resend / notification delivery behavior is unchanged.

## Files

- `app/host/guest-emails/page.tsx` — property-first index
- `app/host/guest-emails/[slug]/page.tsx` — property email setup + upcoming guest instructions
- `app/host/guest-emails/actions.ts` — preserves the property page after saving/toggling/deleting instead of always kicking the host back to the index

## Verification

The three changed/new TS/TSX files passed:
- TypeScript transpile/syntax check
- isolated strict `tsc --noEmit` check with project-style compiler settings

A full Next.js build still runs when this is overlaid into the complete repository.
