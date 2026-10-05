# Find A Place Booking — Host Help / FAQ / Contextual Tips v1

Built against current GitHub `main` at:

`dd9d9c452e545b53f50040808636efc1b70a77bc`

## What was already present before this overlay

The current repo already had:

- public `/help` page for general guest/platform support
- `StripeConnectGuide` with a collapsible Stripe quick overview
- current host onboarding steps and inline calendar setup
- current Payments & taxes workspace

The repo did **not** have:

- a host-only searchable FAQ/job-aid page
- onboarding tips that are on by default and hideable
- dashboard help tips that are off by default and opt-in
- one shared help-content source
- the planned guided Stripe overlay around the embedded Stripe flow

## What this overlay adds

- `/host/help` searchable host FAQ/job aid
- `Help & FAQ` in desktop and mobile host navigation
- top-bar Help & FAQ button
- one code-backed help content source: `lib/host/help-content.ts`
- contextual onboarding help keyed to the active onboarding step
- onboarding help defaults ON, with Hide tips
- normal host-dashboard help defaults OFF, with Show help tips
- preferences stored locally in the browser; no database change
- contextual help for calendars, integrations, rates, properties, payments,
  guest emails, reservations, messages and settings
- guided Stripe setup overlay with Next / Back / Hide guide
- Stripe website tip covering Airbnb/Vrbo/Facebook/other public booking links
- FAQ coverage for the recurring issues we have already hit:
  photos, calendar mapping, iCal two-way setup, Lodgify, ThinkReservations,
  ResNexus safety ranges, Stripe readiness, Arkansas statewide taxes,
  cancellation/refund behavior and calendar troubleshooting

## Important implementation boundary

This is a host-help UI/content overlay only.

It does NOT change:

- onboarding save/finalization logic
- booking or checkout
- Stripe account/session/payment code
- commission math
- taxes
- calendar sync
- PMS workers
- ResNexus worker logic
- iCal import/export
- reservations/refunds
- Supabase schema or RLS

The Stripe coach highlights the Find A Place wrapper around Stripe. It does not
try to modify or inject content into Stripe-controlled secure fields/iframes.

## Files

New:
- app/host/help/page.tsx
- components/HostHelpAssistant.tsx
- components/HostHelpAssistant.module.css
- components/HostHelpCenter.tsx
- components/HostHelpCenter.module.css
- lib/host/help-content.ts

Replaced:
- components/DashboardShell.tsx
- components/HostSidebar.tsx
- components/HostMobileNav.tsx

No database migration is required.
