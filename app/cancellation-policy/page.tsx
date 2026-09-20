import { LegalDocument } from "@/components/LegalDocument";
import { CANCELLATION_POLICY_VERSION } from "@/lib/policies/versions";

export default function CancellationPolicyPage() {
  return (
    <LegalDocument eyebrow="Booking policy" title="Cancellation & Refund Policy" version={CANCELLATION_POLICY_VERSION}>
      <p>
        This is the standard Find A Place cancellation rule for reservations made
        through the platform unless applicable law requires a different result.
      </p>

      <h2>More than 14 days before check-in</h2>
      <p>
        A guest may request an ordinary platform cancellation before the booking
        reaches the 14-day cutoff. The platform will apply the refund treatment
        shown for the reservation and any nonrefundable third-party amount that was
        clearly disclosed before payment.
      </p>

      <h2>14 days before check-in or later</h2>
      <p>
        Once the reservation is 14 days or less from scheduled check-in, the
        reservation is non-cancellable and non-refundable through the ordinary
        guest cancellation process.
      </p>

      <h2>Exceptions</h2>
      <p>
        Find A Place may issue or require a different result when required by law,
        when the host cancels or cannot provide the booked stay, for duplicate or
        unauthorized charges, for a material listing problem, or when Find A Place
        approves an exceptional resolution after reviewing the facts.
      </p>

      <h2>Host cancellation</h2>
      <p>
        If a host cannot honor a confirmed reservation, the host must notify Find A
        Place promptly. Host-caused cancellations may result in guest refunds,
        delayed payouts, account review or other corrective action.
      </p>

      <h2>Chargebacks</h2>
      <p>
        Filing a payment dispute does not change the booking terms. Chargebacks are
        handled through the payment provider and may result in reservation review,
        fund holds and requests for documentation from the guest or host.
      </p>
    </LegalDocument>
  );
}
