import Link from "next/link";

import { Brand } from "@/components/Brand";
import { createAdminClient } from "@/lib/supabase/admin";

import { unsubscribeBookingRecovery } from "./actions";

export default async function RecoveryUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() || "";
  const validToken = /^[0-9a-f-]{36}$/i.test(token);
  const { data: preference } = validToken
    ? await createAdminClient()
        .from("booking_recovery_suppressions")
        .select("recipient_email,opted_out_at")
        .eq("access_token", token)
        .maybeSingle()
    : { data: null };

  return (
    <main className="checkout-page">
      <header className="checkout-header shell">
        <Brand />
        <Link href="/">Find A Place</Link>
      </header>

      <section className="shell standalone-empty checkout-empty guest-state-card">
        <p className="eyebrow dark">Email preferences</p>
        {params.done ? (
          <>
            <h1>Booking-recovery emails are off.</h1>
            <p>
              You will no longer receive missed-booking reminders or discount
              offers from Find A Place. Reservation confirmations and other
              necessary booking messages are not affected.
            </p>
            <Link className="button" href="/stays">Browse stays</Link>
          </>
        ) : !preference ? (
          <>
            <h1>We could not find that preference link.</h1>
            <p>The link may be incomplete or no longer valid.</p>
            <Link className="button" href="/stays">Browse stays</Link>
          </>
        ) : preference.opted_out_at ? (
          <>
            <h1>Booking-recovery emails are already off.</h1>
            <p>
              Reservation confirmations and other necessary booking messages
              are still sent when they apply.
            </p>
            <Link className="button" href="/stays">Browse stays</Link>
          </>
        ) : (
          <>
            <h1>Turn off missed-booking emails?</h1>
            <p>
              This stops “your dates are still available” reminders and
              host-approved recovery discounts. It does not stop booking
              confirmations, receipts, or trip-critical messages.
            </p>
            <form action={unsubscribeBookingRecovery}>
              <input type="hidden" name="token" value={token} />
              <button className="button" type="submit">
                Turn off booking-recovery emails
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
