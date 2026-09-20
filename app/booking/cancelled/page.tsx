import Link from "next/link";

import { Brand } from "@/components/Brand";

export default async function CancelledBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; status?: string }>;
}) {
  const params = await searchParams;
  const pending = params.status === "pending";

  return (
    <main className="confirm-page">
      <header className="checkout-header shell">
        <Brand />
        <span>Reservation cancellation</span>
      </header>

      <section className="confirm-card guest-state-card">
        <p className="eyebrow dark">{pending ? "Refund pending" : "Reservation cancelled"}</p>
        <h1>
          {pending
            ? "Stripe is finishing the refund."
            : "Your reservation has been cancelled."}
        </h1>
        {params.code ? <p>Confirmation <strong>{params.code}</strong></p> : null}
        <p>
          {pending
            ? "Do not submit another cancellation. Find A Place will keep the existing refund request attached to this reservation while Stripe finishes processing it."
            : "The full-refund request was submitted under the Find A Place cancellation policy."}
        </p>
        <Link className="button" href="/stays">Find another stay</Link>
        <Link className="confirm-secondary" href="/">Back to Find A Place</Link>
      </section>
    </main>
  );
}
