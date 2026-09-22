import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { legalStyles } from "@/components/LegalDocument";

export default function PropertyPoliciesPage() {
  return (
    <>
      <Header />
      <main className={legalStyles.wrap}>
        <article className={`shell ${legalStyles.article}`}>
          <p className="eyebrow dark">Guest information</p>
          <h1>Property policies</h1>

          <p>
            Each Find A Place stay is independently operated and can have its
            own house rules, cancellation/refund terms and operating policies.
            The rules that apply to a reservation are presented with that
            property and reviewed again during checkout before payment.
          </p>

          <h2>What property policies can include</h2>
          <p>
            Depending on the stay, policies may cover occupancy, pets, minimum
            booking age, quiet hours, smoking, parking, check-in and checkout,
            cancellation/refund terms, property-specific instructions and an
            uploaded policy document from the host.
          </p>

          <h2>Before booking</h2>
          <p>
            Open the property listing and review its rules before starting
            checkout. During checkout, Find A Place requires the booking guest
            to open the host&apos;s property policies and the platform terms
            before accepting them and continuing to payment.
          </p>

          <h2>Cancellations and refunds</h2>
          <p>
            Cancellation and refund requests go to the host and are decided
            under the property terms accepted for the reservation, subject to
            applicable law. Sending a request does not cancel the reservation
            or guarantee a refund. If the host approves a refund, it is funded
            from the host&apos;s connected payment charge.
          </p>
          <p>
            Find A Place&apos;s host-paid platform commission is earned when a
            paid booking connects the guest and host. That commission is not
            refunded or reversed because the reservation is later cancelled,
            refunded, shortened or changed.
          </p>

          <h2>After booking</h2>
          <p>
            Open My Trip to review booking details, contact the host and send
            any cancellation or change request directly to the host. The
            reservation stays active until the host acts on the request and the
            platform records the resulting change.
          </p>

          <div className={legalStyles.links}>
            <Link href="/stays">Find a stay</Link>
            <Link href="/trip">Manage a trip</Link>
            <Link href="/terms">Booking Terms</Link>
            <Link href="/cancellation-policy">
              Cancellation &amp; Refund Requests
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
