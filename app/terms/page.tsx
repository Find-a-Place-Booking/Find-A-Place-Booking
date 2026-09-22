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
        These terms govern use of Find A Place Booking. By creating or paying
        for a reservation, the booking guest agrees to these terms and to the
        property-specific policies presented during checkout.
      </p>

      <h2>Marketplace and software role</h2>
      <p>
        Find A Place provides listing-hosting, booking software,
        payment-routing, communication, verification and support tools for
        independently owned and operated stays. Unless a listing expressly says
        otherwise, Find A Place does not own, operate, maintain or manage the
        rental property. The host is responsible for the stay and the
        guest&apos;s reservation is with that host.
      </p>

      <h2>Guest and host communication</h2>
      <p>
        Find A Place provides a reservation message thread and may share the
        contact information needed for the host and guest to communicate about
        the stay. Guests should use the secure trip page for arrival questions,
        booking changes and cancellation requests.
      </p>

      <h2>Guest information and verification</h2>
      <p>
        The booking guest must provide accurate contact information, including a
        working email address and phone number. Find A Place may require email
        and identity verification before payment.
      </p>

      <h2>Property rules</h2>
      <p>
        The guest must review the property policies saved with the reservation,
        including house rules, occupancy limits, pet rules, check-in and
        checkout requirements, cancellation terms and any uploaded policy
        document.
      </p>

      <h2>Charges, taxes and payment processing</h2>
      <p>
        The checkout total may include lodging, host fees, add-ons and
        applicable taxes calculated for the reservation. The guest payment is
        processed on the host&apos;s connected merchant account. Find A Place
        receives only its disclosed 5% or 7% platform commission through the
        processor&apos;s application-fee mechanism. Tax amounts charged to the
        guest remain in the host&apos;s connected-account payment proceeds and
        are not retained by Find A Place. The host&apos;s payment processor
        separately charges its processing fees to the host account.
      </p>

      <h2>Cancellations and refunds</h2>
      <p>
        Cancellation requests are sent to the host through the booking tools.
        When a host approves a full guest refund at least 14 calendar days before
        check-in, Find A Place returns its refundable platform commission to the
        host. If the refund is completed fewer than 14 calendar days before
        check-in, the host may still refund the guest, but the Find A Place
        commission remains non-refundable to the host. Because guest taxes are
        part of the host-owned charge, a full guest refund returns the refundable
        tax portion through that host charge rather than through Find A Place&apos;s
        application fee. Processor fees are controlled by the processor.
      </p>

      <h2>Reservation changes</h2>
      <p>
        A guest may request changes to dates, occupancy or other booking
        details. A request does not change the reservation until the host
        approves and applies it. An approved change does not by itself authorize
        a new charge to the guest&apos;s payment method.
      </p>

      <h2>Damage and guest responsibility</h2>
      <p>
        Guests are responsible for damage, missing property, excessive cleaning,
        unauthorized guests or pets, rule violations and other costs caused by
        the guest or the guest&apos;s party, subject to evidence and applicable
        law. Find A Place is not an insurer or property-damage guarantee program.
      </p>

      <h2>Platform limitations</h2>
      <p>
        To the maximum extent permitted by law, Find A Place is not responsible
        for the physical condition of independently operated properties, host or
        guest conduct, a host&apos;s cancellation decision, personal property
        loss, third-party acts, travel interruptions or indirect or
        consequential losses.
      </p>

      <h2>Fraud, safety and enforcement</h2>
      <p>
        Find A Place may pause platform access or transactions, request
        additional verification, preserve records, restrict listings, cooperate
        with payment providers and authorities, or take other reasonable action
        to address suspected fraud, chargebacks, safety concerns or legal
        obligations.
      </p>
    </LegalDocument>
  );
}
