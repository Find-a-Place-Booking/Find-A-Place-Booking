import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { TripLookupForm } from "@/components/TripLookupForm";

export default function TripLookupPage() {
  return (
    <>
      <Header />
      <main className="guest-state-wrap">
        <section className="shell standalone-empty trip-lookup guest-state-card">
          <p className="eyebrow dark">Your trips</p>
          <h1>Open My Trip.</h1>
          <p>
            Enter your reservation number and the email used when booking to see
            your stay details, receipt, host contact information, messages,
            cancellation requests and review options.
          </p>

          <TripLookupForm />

          <p className="muted">
            You can also use the secure trip link from your confirmation email.
            If you still cannot access the reservation, contact Find A Place
            support and include your confirmation number.
          </p>

          <div className="help-inline-actions">
            <Link href="/contact#guest">Guest support →</Link>
            <Link href="/stays">Find another stay →</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
