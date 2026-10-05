Find A Place Booking — Immediate abandoned-checkout email overlay

Why the email did not send immediately:
- Explicit checkout exit was releasing the hold correctly.
- The recovery email was only queued for the cron path, with a delay.
- So clicking the Find A Place logo could free the dates but would not
  immediately send the recovery message.

This overlay changes only the explicit HOME/LOGO exit:
- the hold/payment cleanup runs first
- dates are released
- the checkout recovery email is sent immediately
- checkout_recovery_sent_at is marked only after a successful send
- the cron is made eligible immediately as a fallback if the direct send fails
- sendNotificationOnce keeps it to one recovery email per reservation

"Edit dates or guests" does NOT request an immediate abandonment email, because
the guest is still actively working on that booking.

A tab close/browser close still uses the cron/inactivity fallback; generic
pagehide is intentionally not used to release a hold because mobile browsers
fire it during app switching and payment authentication.
