import { LegalDocument } from "@/components/LegalDocument";
import { GUEST_TERMS_VERSION } from "@/lib/policies/versions";

export default function TermsPage() {
  return (
    <LegalDocument eyebrow="Find A Place" title="Booking Terms of Service" version={GUEST_TERMS_VERSION}>
      <p>
        These terms govern reservations made through Find A Place Booking. By
        creating or paying for a reservation, the booking guest agrees to these
        terms and to the property-specific rules presented during checkout.
      </p>

      <h2>Marketplace role</h2>
      <p>
        Find A Place provides marketplace, booking, payment-routing and support
        services for independently owned and operated stays. Unless a listing
        expressly says otherwise, Find A Place does not own, operate, maintain or
        control the rental property and is not the guest&apos;s landlord or the host&apos;s
        property manager.
      </p>

      <h2>Guest information and verification</h2>
      <p>
        The booking guest must provide accurate contact information, including a
        working email address and phone number. Find A Place may require email and
        identity verification before payment. Identity verification reduces fraud
        and gives hosts more confidence about who is renting, but it is not a
        guarantee of a guest&apos;s conduct, creditworthiness or future behavior.
      </p>

      <h2>Property rules</h2>
      <p>
        The guest must review the property policies saved with the reservation,
        including house rules, occupancy limits, pet rules, check-in and checkout
        requirements and any uploaded policy document. The booking guest is
        responsible for ensuring everyone in the party follows those rules.
      </p>

      <h2>Charges and payment</h2>
      <p>
        The checkout total may include lodging, host fees, add-ons and applicable
        taxes. The amount shown immediately before payment is the amount authorized
        for the reservation. Payment processing is handled through supported
        payment providers, including Stripe.
      </p>

      <h2>Cancellations and refunds</h2>
      <p>
        Find A Place&apos;s standard cancellation cutoff is described in the
        Cancellation &amp; Refund Policy presented at checkout. Property-specific
        rules may add house rules or restrictions but do not override the platform
        cancellation cutoff unless Find A Place expressly permits it.
      </p>

      <h2>Damage and guest responsibility</h2>
      <p>
        Guests are responsible for damage, missing property, excessive cleaning,
        unauthorized guests or pets, rule violations and other costs caused by the
        guest or the guest&apos;s party, subject to evidence, applicable law and any
        dispute process offered by Find A Place or the payment provider.
      </p>

      <h2>Platform limitations</h2>
      <p>
        To the maximum extent permitted by law, Find A Place is not responsible for
        the physical condition of independently operated properties, guest or host
        conduct, personal property loss, third-party acts, travel interruptions or
        indirect or consequential losses. Nothing in these terms excludes rights or
        liabilities that cannot legally be excluded.
      </p>

      <h2>Fraud, safety and enforcement</h2>
      <p>
        Find A Place may pause or cancel transactions, restrict access, hold funds,
        request additional verification or cooperate with hosts, payment providers
        and authorities when reasonably necessary to address suspected fraud,
        chargebacks, safety concerns, prohibited conduct or legal obligations.
      </p>
    </LegalDocument>
  );
}
