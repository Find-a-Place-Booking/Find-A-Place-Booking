Find A Place Booking — Recovery re-hold fix

What was happening:
The email recovery URL was a GET route that immediately restored the reservation
hold. That means revisiting the URL from browser history, an email link preview,
or a mail/security scanner could put the same dates back on hold AFTER the guest
had already left checkout again.

The live reservation event timeline showed exactly that pattern:
- checkout hold released
- then a recovery restore happened afterward

This overlay makes recovery safe:

1. /checkout/recover is now a side-effect-free GET.
2. It redirects to a small "Continue checkout" page.
3. The dates are NOT held just by opening/scanning the email link.
4. Only an explicit Continue checkout button sends a POST to
   /api/booking/recover.
5. The POST rechecks availability and restores the SAME reservation only if the
   dates are still open.
6. Leaving checkout again releases the hold normally.
7. No second recovery email is required.
8. Browser history, email scanners and link previews can no longer silently
   re-hold inventory.

Also fixed:
The old recovery route used `confirmationCode=` when redirecting to the booking
confirmation page. The confirmation page expects `code=`. The new recovery API
uses the correct parameter.

No database migration is required for this fix.
