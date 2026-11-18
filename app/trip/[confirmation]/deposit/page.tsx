import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestSecurityDepositPayment } from "@/components/GuestSecurityDepositPayment";
import { guestCheckoutTokenMatches } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function DepositPage({ params, searchParams }: {
  params: Promise<{ confirmation: string }>;
  searchParams: Promise<{ reservationId?: string; checkoutToken?: string }>;
}) {
  const [{ confirmation }, query] = await Promise.all([params, searchParams]);
  const reservationId = query.reservationId || "";
  const checkoutToken = query.checkoutToken || "";
  if (!/^[0-9a-f-]{36}$/i.test(reservationId) || !guestCheckoutTokenMatches(reservationId, checkoutToken)) notFound();
  const admin = createAdminClient();
  const { data: reservation } = await admin.from("reservations")
    .select("id,status,confirmation_code,check_in,check_out")
    .eq("id", reservationId).eq("confirmation_code", confirmation).maybeSingle();
  if (!reservation || reservation.status !== "CONFIRMED") notFound();
  const { data: deposit } = await admin.from("reservation_security_deposits")
    .select("amount_cents,status,terms_snapshot,due_days_before_arrival,refund_days_after_checkout")
    .eq("reservation_id", reservationId).maybeSingle();
  const back = `/trip/${encodeURIComponent(confirmation)}?reservationId=${encodeURIComponent(reservationId)}&checkoutToken=${encodeURIComponent(checkoutToken)}`;
  return <main className="shell" style={{ maxWidth: 700, paddingBlock: 38 }}>
    <p><Link href={back}>← Back to My Trip</Link></p>
    <h1>Refundable security deposit</h1>
    <p>Booking <strong>{confirmation}</strong> · {reservation.check_in} to {reservation.check_out}</p>
    {!deposit ? <p>This reservation does not have a required separate security deposit.</p> : (
      <div className="panel" style={{ display: "grid", gap: 16 }}>
        <h2>${(deposit.amount_cents / 100).toFixed(2)} refundable deposit</h2>
        <p>Current status: <strong>{deposit.status.replaceAll("_", " ")}</strong></p>
        <p>Requested by the host: {deposit.due_days_before_arrival} day(s) before check-in.</p>
        {deposit.terms_snapshot ? <div><strong>Host's deposit terms</strong><p style={{ whiteSpace: "pre-wrap" }}>{deposit.terms_snapshot}</p></div> : null}
        <p className="muted">The host expects to return eligible funds within {deposit.refund_days_after_checkout} day(s) after departure, subject to the terms and applicable law. The deposit is a separate charge and the card processor may retain processing fees.</p>
        {deposit.status === "PENDING" || deposit.status === "PROCESSING" || deposit.status === "FAILED"
          ? <GuestSecurityDepositPayment reservationId={reservationId} checkoutToken={checkoutToken} amountCents={deposit.amount_cents} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""} />
          : deposit.status === "PAID" ? <p>Deposit received. Contact your host about its return after checkout.</p>
          : <p>Contact the host if you have questions about the deposit.</p>}
      </div>
    )}
  </main>;
}
