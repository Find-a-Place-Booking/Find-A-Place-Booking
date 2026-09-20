import { LegalDocument } from "@/components/LegalDocument";
import { PRIVACY_NOTICE_VERSION } from "@/lib/policies/versions";

export default function PrivacyPage() {
  return (
    <LegalDocument eyebrow="Privacy" title="Privacy & Identity Verification Notice" version={PRIVACY_NOTICE_VERSION}>
      <p>
        Find A Place uses the information necessary to operate listings, bookings,
        payments, guest-host communication, fraud prevention and support.
      </p>

      <h2>Booking information</h2>
      <p>
        Booking records may include the guest&apos;s name, email address, phone number,
        stay dates, party size, selected options, reservation messages, payment
        status and the policy versions accepted for the reservation.
      </p>

      <h2>Email verification</h2>
      <p>
        Find A Place may send a short-lived verification code to the booking email.
        Verification codes are stored as one-way hashes rather than readable codes.
      </p>

      <h2>Identity verification</h2>
      <p>
        Stripe Identity processes government identification and selfie verification
        when required for a booking. Find A Place stores the Stripe verification
        session reference, verification status and timestamp needed to operate the
        reservation. Find A Place does not intentionally store copies of the guest&apos;s
        identity-document images or selfie in its own application database.
      </p>

      <h2>Information shared with hosts</h2>
      <p>
        Hosts receive reservation information needed to operate the stay, including
        the guest&apos;s name, booking email, phone number, party details and verification
        status. Find A Place does not provide the host with the guest&apos;s identity
        document images or selfie through the booking confirmation.
      </p>

      <h2>Service providers</h2>
      <p>
        Find A Place uses third-party providers for infrastructure, payments,
        identity verification, email delivery, fraud prevention and related
        operational services. Those providers process information under their own
        service terms and privacy obligations.
      </p>

      <h2>Retention and legal requests</h2>
      <p>
        Reservation and financial records may be retained as reasonably necessary
        for accounting, disputes, fraud prevention, tax, support and legal
        obligations. Find A Place may disclose information when legally required or
        reasonably necessary to protect users, properties or the platform.
      </p>
    </LegalDocument>
  );
}
