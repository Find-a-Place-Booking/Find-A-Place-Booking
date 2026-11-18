# Policy wording review — guest-paid booking fee

**Draft for Renea's review, not automatically published.** The current live rollout is enabled and the host agreement already describes a guest-paid 7% fee. The guest Terms, cancellations, and some fallback copy still refer to a host-paid commission. This draft is designed for the existing Admin → Site copy & policies editor. Legal review is recommended before publication.

## Guest Terms — Charges, taxes and payment processing

The guest's checkout total may include lodging, host charges, optional extras, applicable lodging taxes, and a separately disclosed Find A Place booking service fee. For new reservations under the guest-paid fee model, the Find A Place fee is 7% of the discounted lodging subtotal, excluding separately listed cleaning fees, pet fees, optional extras, and lodging taxes. The fee is shown before payment. The host's connected merchant account processes the charge and Find A Place retains the service fee through the payment processor's application-fee mechanism. The host is responsible for the host's Stripe processing charges and for lodging-tax reporting and remittance, subject to applicable law. Reservations booked under an earlier host-paid commission model retain the fees and financial terms recorded when booked; existing charges are not recalculated.

## Guest Terms — Cancellations and refunds

The host's booking-specific cancellation policy governs the lodging refund, subject to applicable law. A cancellation request alone does not cancel a reservation or guarantee a refund. The Find A Place guest booking service fee is separate from lodging and is treated according to the fee and cancellation disclosures accepted at checkout and applicable law. A later host-approved refund of lodging does not automatically refund the service fee. The host remains responsible for the guest refunds it authorizes on its connected payment charge. Earlier host-commission reservations retain their original recorded fee/refund arrangement.

## Host Agreement — Reservation changes and refunds

Hosts decide booking changes and cancellation/refund requests according to the property terms accepted at booking, subject to applicable law. New guest-paid reservations show the Find A Place service fee to the guest at checkout; Find A Place does not separately deduct a second host platform commission on those reservations. When the host approves a refund, the refund is processed against the host's connected charge. Payment processing costs and application-fee refunds depend on the checkout disclosures, processor mechanics, refund type and applicable law. Earlier reservations remain governed by their snapshotted fee and refund arrangements; never reprice or reclassify an existing reservation retroactively.

## Cancellation Policy — Service fees and legacy commissions

For new guest-paid reservations, a Find A Place service fee is disclosed before purchase on the lodging subtotal. Whether a service fee is refundable is governed by the fee disclosures agreed at booking and any non-waivable legal rights. A refund of a host's lodging amount is not automatically a refund of the platform service fee. For older host-paid commission reservations, the fee and refund treatment originally recorded with that reservation applies.

## Deployment guardrail

Do not publish these revisions until the host-signup action has been changed to read the current `platform_policy_versions` values rather than hardcoded September versions, and checkout policy acceptance has been checked for snapshot consistency. Every publication must advance the appropriate policy version and retain acceptance records and audit history. This package intentionally does not change financial calculations, fee percentages, refunds, or historic reservations.
