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
        Find A Place provides the software used by independently operated hosts
        and their guests. Each reservation is subject to the host&apos;s
        cancellation and refund terms shown and accepted before payment. A
        cancellation request is a request to the host; it does not by itself
        cancel the reservation or create a refund.
      </p>

      <h2>The host&apos;s accepted terms govern ordinary cancellations</h2>
      <p>
        Hosts set the guest-facing cancellation and refund terms for their
        property. Those terms are saved with the reservation at booking. The host
        is responsible for applying them consistently and in accordance with
        applicable law.
      </p>

      <h2>How a guest requests cancellation</h2>
      <p>
        The guest can open the secure My Trip page and send a cancellation request
        directly to the host. The reservation remains confirmed while the request
        is pending. The guest and host can continue communicating in the booking
        message thread while the host reviews the request.
      </p>

      <h2>Host decisions</h2>
      <p>
        The host may approve or decline an ordinary cancellation request under
        the accepted property terms and applicable law. When those terms permit
        it, a host may approve cancellation without a refund. A host may also
        approve a full refund. Find A Place records the decision so both parties
        have a consistent booking history.
      </p>

      <h2>Host-approved refunds</h2>
      <p>
        When the host approves a full refund through Find A Place, the platform
        can transmit that host-authorized refund instruction to the connected
        payment processor. The refund is made against the host&apos;s connected
        payment account. Banks, card networks and payment processors control when
        the credit becomes available to the guest.
      </p>

      <h2>Find A Place&apos;s role</h2>
      <p>
        Find A Place does not independently decide ordinary cancellation requests,
        guarantee that a host will approve a request, or promise an ordinary
        refund from Find A Place funds. Find A Place may provide technical support,
        preserve reservation records, correct platform or payment errors, enforce
        platform rules, address fraud or safety issues, and take action when
        required by applicable law or payment-provider obligations.
      </p>

      <h2>If the host cannot provide the stay</h2>
      <p>
        A host who cannot provide a confirmed stay must promptly communicate with
        the guest and take the steps required by the accepted booking terms and
        applicable law. Find A Place may restrict a listing or host account when a
        host repeatedly fails to honor confirmed reservations or otherwise
        violates the Host Agreement.
      </p>

      <h2>Payment disputes</h2>
      <p>
        A chargeback or card dispute is handled through the payment processor and
        does not replace communication between the guest and host. Find A Place may
        provide booking records to the processor and may restrict platform access
        when reasonably necessary to address fraud, abuse or legal obligations.
      </p>

      <p>
        Nothing in this policy limits rights or obligations that cannot legally be
        waived, assigned or transferred.
      </p>
    </LegalDocument>
  );
}
