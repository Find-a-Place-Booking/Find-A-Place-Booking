Find A Place Booking — Host Call / Text / Email Contact Fix

This overlay replaces:
  components/PortalInteractionEnhancer.tsx

What it fixes
-------------
Existing host reservation and Messages buttons already render mailto:, tel: and
sms: links, but some mobile/in-app browsers can fail to hand those links off
reliably. Guest phone values also arrive in several formats (10 digits, leading
1, parentheses and hyphens).

The portal now:
- intercepts only mailto:, tel: and sms: links from an explicit user click
- normalizes US guest phone numbers to +1XXXXXXXXXX before opening the device app
- opens the protocol directly with window.location.assign()
- keeps normal internal host navigation untouched
- if the browser does not leave the page after 900ms, copies the email address
  or phone number to the clipboard and shows a fallback toast

This applies everywhere inside the host/admin portal shell, including:
- reservation detail Email / Call guest / Text guest
- host Messages desktop contact buttons
- host Messages mobile contact buttons

No booking, Stripe, cancellation, calendar, database or guest-checkout logic is
changed.
