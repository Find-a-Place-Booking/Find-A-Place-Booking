FIND A PLACE - FINANCIAL UI OVERLAY

This ZIP contains finished replacement files only.

It DOES NOT include:
- PowerShell update scripts
- Supabase migrations
- booking hold changes
- Stripe PaymentIntent changes
- Stripe webhook changes
- Stripe Connect routing changes
- tax calculation changes

Extract this ZIP directly over the root of:
C:\Users\jlccu\find-a-place-booking-production-step-1

Allow Windows to replace the matching files.

Then run:
npm run typecheck
npm run build
git diff --check

Updated UI:
- Guest booking confirmation itemized receipt
- Guest trip itemized receipt + print button
- Host Payments & taxes transaction list
- Host reservation settlement breakdown
- Admin reservation Stripe/application-fee breakdown
