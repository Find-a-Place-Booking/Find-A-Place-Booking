import { LegalDocument } from "@/components/LegalDocument";
import { GUEST_TERMS_VERSION } from "@/lib/policies/versions";

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Find A Place"
      title="Booking Terms of Service"
      version={GUEST_TERMS_VERSION}
    >
      <p>
        These terms govern use of Find A Place Booking. By creating or paying for a
        reservation, the booking guest agrees to these terms and to the
        property-specific policies presented during checkout.
      </p>

      <h2>Marketplace and software role</h2>
      <p>
        Find A Place provides listing-hosting, booking software, payment-routing,
        communication, verification and support tools for independently owned and
        operated stays. Unless a listing expressly says otherwise, Find A Place
        does not own, operate, maintain or manage the rental property. The host is
        responsible for the stay and the guest&apos;s reservation is with that host.
      </p>

      <h2>Guest and host communication</h2>
      <p>
        Find A Place provides a reservation message thread and may share the contact
        information needed for the host and guest to communicate about the stay.
        Guests should use the secure trip page for arrival questions, booking
        changes and cancellation requests. Hosts are responsible for responding to
        booking-specific requests and providing the stay they offered.
      </p>

      <h2>Guest information and verification</h2>
      <p>
        The booking guest must provide accurate contact information, including a
        working email address and phone number. Find A Place may require email and
        identity verification before payment. Verification is a fraud-reduction
        tool and is not a guarantee of a guest&apos;s conduct, creditworthiness or
        future behavior.
      </p>

      <h2>Property rules</h2>
      <p>
        The guest must review the property policies saved with the reservation,
        including house rules, occupancy limits, pet rules, check-in and checkout
        requirements, cancellation terms and any uploaded policy document. The
        booking guest is responsible for ensuring everyone in the party follows
        those rules.
      </p>

      <h2>Charges and payment processing</h2>
      <p>
        The checkout total may include lodging, host fees, add-ons and applicable
        taxes. Supported payment processors, including Stripe, process the guest
        payment on the host&apos;s connected merchant account. Find A Place may collect
        its disclosed 5% or 7% platform fee as an application fee and may retain tax
        amounts that Find A Place is legally or operationally configured to remit.
        The host&apos;s payment processor charges its own processing fees and controls
        settlement and bank-deposit timing for the host account.
      </p>

      <h2>Cancellations and refunds</h2>
      <p>
        Cancellation requests are sent to the host through the booking tools. The
        host applies the property-specific cancellation terms accepted at booking,
        subject to applicable law. Find A Place does not independently promise or
        fund ordinary host-approved refunds. When a host approves a refund through
        the platform, Find A Place may transmit that host-authorized instruction to
        the connected payment processor and update the reservation record.
      </p>

      <h2>Damage and guest responsibility</h2>
      <p>
        Guests are responsible for damage, missing property, excessive cleaning,
        unauthorized guests or pets, rule violations and other costs caused by the
        guest or the guest&apos;s party, subject to evidence, applicable law and any
        dispute process offered by the host or payment provider. Find A Place is not
        an insurer or property-damage guarantee program.
      </p>

      <h2>Platform limitations</h2>
      <p>
        To the maximum extent permitted by law, Find A Place is not responsible for
        the physical condition of independently operated properties, host or guest
        conduct, a host&apos;s cancellation decision, personal property loss,
        third-party acts, travel interruptions or indirect or consequential losses.
        Nothing in these terms excludes rights or liabilities that cannot legally be
        excluded.
      </p>

      <h2>Fraud, safety and enforcement</h2>
      <p>
        Find A Place may pause platform access or transactions, request additional
        verification, preserve records, restrict listings, cooperate with payment
        providers and authorities, or take other reasonable action to address
        suspected fraud, chargebacks, safety concerns, prohibited conduct or legal
        obligations.
      </p>
    </LegalDocument>
  );
}
