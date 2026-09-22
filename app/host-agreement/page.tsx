import { LegalDocument } from "@/components/LegalDocument";
import { HOST_AGREEMENT_VERSION } from "@/lib/policies/versions";

export default function HostAgreementPage() {
  return (
    <LegalDocument
      eyebrow="For hosts"
      title="Find A Place Host Agreement"
      version={HOST_AGREEMENT_VERSION}
    >
      <p>
        This agreement applies to hosts and property managers who create a host
        account or list a stay with Find A Place Booking.
      </p>

      <h2>Authority to list</h2>
      <p>
        The host represents that they own the property or have authority to market,
        rent and receive proceeds for it. The host is responsible for licenses,
        permits, permissions, insurance and compliance obligations that apply to the
        property or hosting activity.
      </p>

      <h2>Accurate listings and safe stays</h2>
      <p>
        Hosts must keep listing details, availability, rates, fees, amenities,
        occupancy limits, photos, address information and property rules accurate.
        Hosts are responsible for the physical property, maintenance, access,
        habitability, safety equipment and services promised in the listing.
      </p>

      <h2>Guest relationship and communication</h2>
      <p>
        Confirmed reservations are between the host and the booking guest. Find A
        Place provides the booking software and message tools, but the host is
        responsible for communicating with the guest about the property, arrival,
        stay-specific questions, requested changes and cancellation decisions.
      </p>

      <h2>Property policies</h2>
      <p>
        Hosts may publish property policies and upload a policy PDF. Find A Place
        snapshots the policies associated with a reservation so the guest can review
        and accept the version presented at booking. Hosts must apply those policies
        consistently and may not use them to avoid non-waivable legal obligations.
      </p>

      <h2>Payment processing and Find A Place fees</h2>
      <p>
        Guest booking charges are processed on the host&apos;s connected payment
        account. The host is responsible for the processor&apos;s transaction fees,
        chargebacks and account requirements under the processor&apos;s terms. Find A
        Place collects the commission tier assigned to the host or property as an
        application fee. Taxes that Find A Place collects for remittance are not
        platform revenue.
      </p>

      <h2>Host balance and bank deposits</h2>
      <p>
        Find A Place does not hold or manually schedule ordinary host booking
        proceeds under the direct-charge model. The payment processor controls
        settlement, balance availability and bank-deposit timing for the host&apos;s
        connected account.
      </p>

      <h2>Cancellations and refunds</h2>
      <p>
        Guest cancellation requests are delivered to the host. The host is
        responsible for approving or declining requests, and for deciding whether an
        approved cancellation is refundable under the property policy accepted for the
        reservation and applicable law. When a host approves a refund through Find A
        Place, the platform may submit that host-authorized
        instruction to the connected processor so payment and booking records stay
        synchronized. Find A Place does not independently promise or fund ordinary
        guest refunds from platform funds.
      </p>

      <h2>Damage and disputes</h2>
      <p>
        Find A Place is not an insurer or damage-guarantee program. Hosts remain
        responsible for documenting and pursuing guest-caused damage claims. Find A
        Place may provide reservation records, verification status and communication
        history but does not guarantee recovery of damage costs.
      </p>

      <h2>Taxes</h2>
      <p>
        Find A Place may collect and remit marketplace lodging or sales taxes where
        the platform determines it is required or configured to do so. Hosts remain
        responsible for income taxes, business taxes, licenses and taxes that are
        legally the host&apos;s responsibility and are not collected and remitted by
        Find A Place.
      </p>

      <h2>Account and enforcement</h2>
      <p>
        Find A Place may request verification, pause or remove listings, investigate
        complaints, restrict access or take other reasonable action to protect
        guests, hosts, the platform or legal compliance.
      </p>
    </LegalDocument>
  );
}
