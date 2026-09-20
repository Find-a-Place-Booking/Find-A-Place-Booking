import { LegalDocument } from "@/components/LegalDocument";
import { HOST_AGREEMENT_VERSION } from "@/lib/policies/versions";

export default function HostAgreementPage() {
  return (
    <LegalDocument eyebrow="For hosts" title="Find A Place Host Agreement" version={HOST_AGREEMENT_VERSION}>
      <p>
        This agreement applies to hosts and property managers who create a host
        account or list a stay with Find A Place Booking.
      </p>

      <h2>Authority to list</h2>
      <p>
        The host represents that they own the property or have authority to market,
        rent and receive proceeds for it. The host is responsible for obtaining any
        licenses, permits, permissions or insurance required for the property and
        for complying with applicable lodging, safety and local operating rules.
      </p>

      <h2>Accurate listings and safe stays</h2>
      <p>
        Hosts must keep listing details, availability, rates, fees, amenities,
        occupancy limits, photos, address information and property rules accurate.
        Hosts are responsible for the physical property, maintenance, access,
        habitability, safety equipment and the services promised in the listing.
      </p>

      <h2>Guest and property policies</h2>
      <p>
        Hosts may publish written property policies and may upload a policy PDF.
        Find A Place snapshots the policies associated with a reservation so the
        guest can review and accept the version that applied when booking. Hosts
        may not use property rules to contradict platform terms or applicable law.
      </p>

      <h2>Platform fees and processing</h2>
      <p>
        Find A Place charges the commission tier assigned to the host or property.
        The platform may also recover payment-processing costs from host proceeds
        according to the pricing shown in the host dashboard. Taxes collected by
        Find A Place for marketplace remittance are not platform revenue.
      </p>

      <h2>Payout timing</h2>
      <p>
        Standard host payouts are scheduled no earlier than 13 days before the
        reservation&apos;s check-in date. Payouts may occur later when required for
        processor settlement, fraud review, disputes, refunds, account verification,
        legal compliance or other legitimate operational reasons.
      </p>

      <h2>Cancellations</h2>
      <p>
        Hosts agree to honor confirmed reservations except when cancellation is
        necessary for safety, property unavailability, legal compliance or another
        reason accepted by Find A Place. The platform&apos;s guest cancellation and
        refund policy applies to bookings made through Find A Place.
      </p>

      <h2>Damage and disputes</h2>
      <p>
        Find A Place is not an insurer or damage-guarantee program. Hosts remain
        responsible for documenting and pursuing claims for guest-caused damage.
        Find A Place may provide reservation records, verification status and
        payment/dispute tools but does not guarantee recovery of damage costs.
      </p>

      <h2>Taxes</h2>
      <p>
        Find A Place may collect and remit marketplace lodging or sales taxes where
        the platform determines it is responsible to do so. Hosts remain responsible
        for income taxes, business taxes, licenses and taxes that are legally the
        host&apos;s responsibility and are not collected and remitted by the platform.
      </p>

      <h2>Account and enforcement</h2>
      <p>
        Find A Place may request verification, pause listings or payouts, reject a
        property, investigate complaints, suspend access or remove listings to
        protect guests, hosts, the platform or legal compliance.
      </p>
    </LegalDocument>
  );
}
