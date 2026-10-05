Find A Place Booking — Branded Transactional Emails

Drop this overlay over the project root.

Files
-----
lib/notifications/transactional-email.ts
lib/notifications/guest-verification-email.ts

What this does
--------------
All emails that use sendNotificationOnce now automatically receive one shared
Find A Place email shell:

- Find A Place seal from:
  /public/brand/find-a-place-seal.png
- Find A Place Booking wordmark
- "Booking · Arkansas, Missouri & beyond" brand line
- cream page background
- white rounded content card
- green brand accent
- consistent typography and spacing
- existing action links rendered as clear CTA buttons
- branded footer and findaplacebooking.com
- hidden preheader text for inbox previews
- responsive mobile layout

This automatically applies to the existing:
- guest booking confirmation
- host new-booking email
- checkout recovery email
- guest/host reservation messages
- cancellation request and cancellation decision emails
- change request / decision emails
- direct-charge/payment confirmation emails
- refund emails
- dispute alerts
- host-configured pre-arrival / post-stay guest emails
- failed-email retries

The guest verification-code email previously bypassed sendNotificationOnce and
sent directly through Resend, so it was updated separately to use the same
Find A Place visual shell.

Safety
------
This does NOT change:
- email recipient routing
- notification idempotency
- retry logic
- reservation/payment state
- booking confirmation logic
- Stripe
- taxes
- calendars
- refund/cancellation behavior

Previously persisted FAILED email bodies are also branded at delivery time, so
retries can use the new shell without a database migration.

Important: inbox/avatar icon
----------------------------
The small sender icon shown by Gmail/Apple/Yahoo is NOT controlled by HTML or
Resend's `html` field. That requires sender-domain branding such as BIMI
(and provider/domain requirements such as SPF/DKIM/DMARC and, for some inbox
logo displays, a VMC/CMC or provider-specific branded-mail setup).

This overlay fixes the email-body branding now and uses the existing public
Find A Place seal inside the email. The inbox avatar needs the domain/DNS side
configured separately; do not expect a code deploy alone to change that icon.

Recommended sender
------------------
Keep EMAIL_PLATFORM_NAME as:
  Find A Place Booking

And send booking mail from a branded domain address such as:
  bookings@findaplacebooking.com
