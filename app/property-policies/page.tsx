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
            Each Find A Place stay can have its own house rules and operating
            policies. The rules that apply to a reservation are presented with
            that property and are reviewed again during checkout before payment.
          </p>

          <h2>What property policies can include</h2>
          <p>
            Depending on the stay, policies may cover occupancy, pets, minimum
            booking age, quiet hours, smoking, parking, check-in and checkout,
            property-specific instructions and an uploaded policy document from
            the host.
          </p>

          <h2>Before booking</h2>
          <p>
            Open the property listing and review its rules before starting
            checkout. During checkout, Find A Place requires the booking guest to
            open the property policies and the platform terms before accepting
            them and continuing to payment.
          </p>

          <h2>After booking</h2>
          <p>
            If you already have a reservation, open your trip to review the
            booking details and the policy information associated with that stay.
          </p>

          <div className={legalStyles.links}>
            <Link href="/stays">Find a stay</Link>
            <Link href="/trip">Manage a trip</Link>
            <Link href="/terms">Booking Terms</Link>
            <Link href="/cancellation-policy">Cancellation Policy</Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
