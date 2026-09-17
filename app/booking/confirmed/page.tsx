import Link from "next/link";

import { Brand } from "@/components/Brand";
import { SandboxBookingConfirmation } from "@/components/SandboxBookingConfirmation";

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; reservationId?: string }>;
}) {
  const params = await searchParams;
  const sandboxEnabled = process.env.BOOKING_SANDBOX_ENABLED === "true";

  return (
    <main className="confirm-page">
      <header className="checkout-header shell">
        <Brand />
        <span>Your reservation</span>
      </header>

      <section className="confirm-card guest-state-card">
        {sandboxEnabled && params.code && params.reservationId ? (
          <SandboxBookingConfirmation
            confirmationCode={params.code}
            reservationId={params.reservationId}
          />
        ) : (
          <>
            <p className="eyebrow dark">No trip loaded</p>
            <h1>There isn’t a confirmed booking here yet.</h1>
            <p>
              Live booking remains closed while the sandbox payment flow is
              being tested.
            </p>
          </>
        )}

        <Link className="button" href="/stays">Find another stay</Link>
        <Link className="confirm-secondary" href="/">Back to Find A Place</Link>
      </section>
    </main>
  );
}
