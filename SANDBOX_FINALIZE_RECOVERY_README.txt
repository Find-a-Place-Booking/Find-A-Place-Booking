FIND A PLACE — SANDBOX FINALIZE RECOVERY FIX

Current error:
403 { error: "Sandbox reservation session not found." }

Cause:
The sandbox finalize endpoint required the temporary HttpOnly reservation cookie.
After the checkout page refreshed/rebuilt, that cookie was not available for the
manual recovery request, even though Stripe had already succeeded.

Fix:
The sandbox finalizer no longer depends on the browser cookie.

It is still protected by:
- BOOKING_SANDBOX_ENABLED=true
- same-origin request check
- reservation must exist in the database
- Stripe payment row must exist
- PaymentIntent is retrieved server-to-server from Stripe
- PaymentIntent must have status=succeeded
- PaymentIntent metadata.reservation_id must match the requested reservation
- PaymentIntent metadata.payment_id must match the local payment row
- database confirmation function is idempotent

This route cannot create another charge. It only finalizes an already-succeeded
Stripe PaymentIntent.

Replace:
app/api/booking/sandbox/finalize/route.ts

Then restart `npm run dev` if Next does not hot-reload it.

After applying the SQL zero-fee ledger hotfix, retry:

fetch("/api/booking/sandbox/finalize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    reservationId: "190b71f5-a9aa-481f-b7bc-560a9a392d4d"
  })
}).then(r => r.json()).then(console.log)
