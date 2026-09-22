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
        Find A Place provides booking software used by independently operated
        hosts and their guests. Each reservation is subject to the host&apos;s
        cancellation and refund terms shown and accepted before payment.
      </p>

      <h2>The host&apos;s accepted terms govern ordinary cancellations</h2>
      <p>
        Hosts set the guest-facing cancellation and refund terms for their
        property. Those terms are saved with the reservation at booking.
      </p>

      <h2>How a guest requests cancellation</h2>
      <p>
        The guest can open the secure My Trip page and send a cancellation
        request directly to the host. The reservation remains confirmed while
        the request is pending.
      </p>

      <h2>Host decisions</h2>
      <p>
        The host may approve or decline an ordinary cancellation request. Where
        the accepted property terms permit it, the host may approve cancellation
        without a refund or approve a full guest refund.
      </p>

      <h2>Full refunds and the 14-day platform commission cutoff</h2>
      <p>
        When the host approves a full guest refund through Find A Place, the
        refund is created against the host&apos;s connected payment charge. If the
        refund is completed at least 14 calendar days before check-in, Find A
        Place also returns its refundable platform commission to the host. If
        the refund is completed fewer than 14 calendar days before check-in,
        Find A Place keeps its commission. Guest tax dollars are not part of the
        Find A Place application fee; when a full guest refund includes those
        taxes, they are returned from the host-owned charge. Processor fees are
        controlled by the payment processor and may not be returned.
      </p>

      <h2>Booking record and calendar</h2>
      <p>
        Once an approved cancellation is completed, Find A Place records the
        reservation as cancelled and releases its internal availability block.
      </p>

      <h2>Find A Place&apos;s role</h2>
      <p>
        Find A Place does not independently decide ordinary cancellation
        requests or guarantee that a host will approve a request. Find A Place
        may provide technical support, preserve reservation records, correct
        platform or payment errors, and address fraud or safety issues.
      </p>

      <p>
        Nothing in this policy limits rights or obligations that cannot legally
        be waived, assigned or transferred.
      </p>
    </LegalDocument>
  );
}
