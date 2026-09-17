# Corrected Stripe model for Find A Place

## What we want economically

For a booking amount `G`:

- Find A Place commission = 5% or 7% of the commission base.
- Stripe processing cost is borne economically by the host.
- Host proceeds = guest total - platform commission - processor fee.

## Important Stripe accounting detail

With destination charges, Stripe charges the processing fee to the platform
balance. Stripe does not directly debit that processing fee from the recipient
host account.

To make the host bear that cost economically, the booking payment logic must
withhold the processor-fee amount from host proceeds (or equivalently increase
the amount retained on the platform by that processor-fee amount).

Example:

Guest total:             $1,000.00
Platform commission 5%:     $50.00
Stripe processor fee:       $29.30  (example only; use actual method/rate)
Host proceeds:              $920.70
Platform gross retained:     $79.30
Stripe debits platform:      $29.30
Platform net commission:     $50.00

That preserves the intended economics:
- host bears processing cost
- Find A Place keeps its full 5%/7%
- Stripe still technically debits the platform because that is how destination
  charge accounting works.

Do NOT assume every payment method costs exactly 2.9% + 30c. Actual fee
reconciliation should use Stripe's balance transaction after payment succeeds.

## Host onboarding

The connected host account is:
- Accounts v2
- recipient
- stripe_balance.stripe_transfers requested
- dashboard: none
- embedded Connect onboarding
- responsibilities fees_collector = application
- responsibilities losses_collector = application

Those responsibility values are required by Stripe for the configuration being
created. The previous patches incorrectly used `stripe`, which Stripe rejected.

## Booking implementation

When guest checkout is opened, do not hard-code host proceeds from a guessed fee
and call it final.

Recommended flow:
1. Snapshot guest total and 5%/7% platform commission in the reservation.
2. Create destination-charge payment.
3. Retain enough from host proceeds to cover the configured processor-fee policy.
4. On webhook success, read the actual Stripe processing fee from the charge's
   balance transaction.
5. Reconcile processor_fee_actual_cents and host_proceeds_cents in our ledger.

For card-only sandbox testing we can estimate the processing amount before
payment so the host proceeds are predictable, then reconcile actual afterward.
