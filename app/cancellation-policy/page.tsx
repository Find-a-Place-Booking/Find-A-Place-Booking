import { LegalDocument } from "@/components/LegalDocument";
import { CANCELLATION_POLICY_VERSION } from "@/lib/policies/versions";

export default function CancellationPolicyPage() {
  return (
    <LegalDocument
      eyebrow="Booking policy"
      title="Cancellation Requests & Refunds"
      version={CANCELLATION_POLICY_VERSION}
    >
      <p>
        Find A Place provides booking software used by independently
        operated hosts and their guests. Each reservation is subject to
        the host&apos;s cancellation and refund terms shown and accepted
        before payment.
      </p>

      <h2>The host&apos;s accepted terms govern guest refunds</h2>
      <p>
        Hosts set the guest-facing cancellation and refund terms for
        their property. Those terms are saved with the reservation at
        booking. Subject to applicable law, the host decides whether a
        cancellation request is declined, cancelled without a refund,
        partially refunded or fully refunded.
      </p>

      <h2>How a guest requests cancellation</h2>
      <p>
        The guest can open the secure My Trip page and send a
        cancellation request directly to the host. The reservation
        remains confirmed while the request is pending. A request does
        not guarantee a cancellation or refund.
      </p>

      <h2>Find A Place commission is non-refundable</h2>
      <p>
        Find A Place earns its platform commission when a paid
        reservation connects the guest and host through the marketplace.
        That commission is not refunded, credited back to the host or
        reversed because the reservation is later cancelled, refunded,
        shortened or changed.
      </p>

      <h2>Host-approved guest refunds</h2>
      <p>
        If the host approves a guest refund, the refund is created
        against the host&apos;s connected payment charge. The host is
        responsible for the amount it authorizes. A full guest refund may
        return the guest&apos;s full eligible booking charge, including
        refundable taxes, while the Find A Place commission remains with
        Find A Place and is borne by the host. Processor fees are
        controlled by the payment processor and may not be returned.
      </p>

      <h2>Reservation changes</h2>
      <p>
        A reservation change does not automatically create a refund. If
        a host separately approves a refund because dates, occupancy or
        other booking details changed, the host-approved refund is funded
        from the host payment charge and the original Find A Place
        commission remains non-refundable.
      </p>

      <h2>Booking record and calendar</h2>
      <p>
        Once a host-approved cancellation is completed, Find A Place
        records the reservation as cancelled and releases its internal
        availability block. Refund processing can continue separately
        without keeping the cancelled dates blocked.
      </p>

      <h2>Find A Place&apos;s role</h2>
      <p>
        Find A Place does not independently decide ordinary guest
        cancellation requests or guarantee that a host will approve a
        refund. Find A Place may provide technical support, preserve
        reservation records, correct platform or payment errors, and
        address fraud or safety issues.
      </p>

      <p>
        Nothing in this policy limits rights or obligations that cannot
        legally be waived, assigned or transferred.
      </p>
    </LegalDocument>
  );
}
