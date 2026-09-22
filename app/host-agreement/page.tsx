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
        The host represents that they own the property or have authority to
        market, rent and receive proceeds for it. The host is responsible for
        licenses, permits, permissions, insurance and compliance obligations
        that apply to the property or hosting activity.
      </p>

      <h2>Accurate listings and safe stays</h2>
      <p>
        Hosts must keep listing details, availability, rates, fees, amenities,
        occupancy limits, photos, address information and property rules
        accurate. Hosts are responsible for the physical property, maintenance,
        access, habitability, safety equipment and services promised in the
        listing.
      </p>

      <h2>Guest relationship and communication</h2>
      <p>
        Confirmed reservations are between the host and the booking guest. Find
        A Place provides booking and communication software, while the host is
        responsible for the stay and booking-specific decisions.
      </p>

      <h2>Property policies</h2>
      <p>
        Hosts may publish property policies and upload a policy PDF. Find A Place
        snapshots the policies associated with a reservation so the guest can
        review and accept the version presented at booking.
      </p>

      <h2>Payment processing and Find A Place fees</h2>
      <p>
        Guest booking charges are processed directly on the host&apos;s connected
        merchant account. Find A Place&apos;s application fee contains only the
        commission assigned to the host or property, normally 5% or 7% of the
        commissionable rental amount. Find A Place does not retain guest tax
        dollars in its application fee. Stripe or another processor separately
        charges processing fees to the host&apos;s connected account.
      </p>

      <h2>Taxes</h2>
      <p>
        Find A Place may calculate applicable guest-facing lodging taxes as part
        of checkout. Those tax dollars remain in the host&apos;s connected-account
        payment proceeds. The host is responsible for reporting, remitting and
        otherwise handling taxes associated with the host&apos;s rental activity
        except to the extent applicable law or a separate written arrangement
        expressly provides otherwise.
      </p>

      <h2>Host balance and bank deposits</h2>
      <p>
        Find A Place does not hold or manually schedule ordinary host booking
        proceeds. The payment processor controls balance availability and bank
        deposit timing for the host&apos;s connected account.
      </p>

      <h2>Cancellations, refunds and platform commission</h2>
      <p>
        Guest cancellation requests are delivered to the host. If a full guest
        refund is completed at least 14 calendar days before check-in, Find A
        Place returns its refundable platform commission to the host. If a
        refund is completed fewer than 14 calendar days before check-in, the
        Find A Place commission remains non-refundable to the host. Guest taxes
        are part of the host-owned charge and are returned through that charge
        when included in a full guest refund. Processor fees may remain
        non-refundable under the processor&apos;s terms.
      </p>

      <h2>Reservation changes</h2>
      <p>
        Hosts may approve or decline guest change requests. Applying new dates
        updates the reservation and Find A Place calendar together, but it does
        not automatically alter the amount already charged.
      </p>

      <h2>Damage and disputes</h2>
      <p>
        Find A Place is not an insurer or damage-guarantee program. Hosts remain
        responsible for documenting and pursuing guest-caused damage claims.
      </p>

      <h2>Account and enforcement</h2>
      <p>
        Find A Place may request verification, pause or remove listings,
        investigate complaints, restrict access or take other reasonable action
        to protect guests, hosts, the platform or legal compliance.
      </p>
    </LegalDocument>
  );
}
