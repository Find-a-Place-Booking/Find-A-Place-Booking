import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { getHostPropertyBySlug } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";
import { securityDepositPaymentsEnabled } from "@/lib/payments/security-deposit-toggle";
import { saveSecurityDepositPolicy } from "./actions";

export default async function SecurityDepositSettingsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const property = await getHostPropertyBySlug(slug);
  if (!property) notFound();
  const client = await createClient();
  const depositActive = securityDepositPaymentsEnabled();
  const { data, error } = await client.from("unit_security_deposit_settings")
    .select("enabled,amount_cents,terms,due_days_before_arrival,refund_days_after_checkout")
    .eq("unit_id", property.unitId).maybeSingle();
  return <DashboardShell active="Rates & fees" title={`Refundable deposit · ${property.form.name || "Property"}`}>
    <div className="panel">
      <Link href={`/host/rates/${encodeURIComponent(slug)}`}>← Rates &amp; fees</Link>
      <h2>Refundable security deposit</h2>
      <p className="muted">Optional per-property deposit collected as a <strong>separate card payment after the booking</strong>. It is not lodging revenue, is not included in lodging tax or Find A Place's booking fee, and is returned separately through the host's connected Stripe account. Stripe processing fees can apply even if refunded.</p>
      <p className="muted">A deposit is not a card hold for the whole stay. Guests must approve the separate charge. Deposits you enable now apply only to future confirmed reservations; previous reservations stay unchanged.</p>
      {!depositActive ? <p className="admin-message neutral">Deposit payments are not activated for this deployment. You can review existing settings, but you cannot enable a new deposit until payment and refund testing is complete.</p> : null}
      {q.saved ? <p className="admin-message success">Deposit policy saved.</p> : null}
      {q.error || error ? <p className="admin-message error">Could not save or load deposit settings. Check the amount and retry.</p> : null}
      <form action={saveSecurityDepositPolicy} className="settings-form">
        <input name="slug" type="hidden" value={slug} />
        <label className="checkline"><input name="enabled" type="checkbox" defaultChecked={data?.enabled ?? false} disabled={!depositActive} /> <span>Require a separate refundable deposit on future reservations</span></label>
        <label><span>Deposit amount ($)</span><input name="amount" type="number" min="0" max="2500" step="0.01" defaultValue={data?.amount_cents ? (data.amount_cents/100).toFixed(2) : ""} placeholder="Leave blank if not required" /></label>
        <label><span>Due before check-in (days)</span><input name="dueDays" type="number" min="0" max="30" defaultValue={data?.due_days_before_arrival ?? 2} /></label>
        <label><span>Target refund after checkout (days)</span><input name="refundDays" type="number" min="0" max="30" defaultValue={data?.refund_days_after_checkout ?? 7} /></label>
        <label><span>Deposit conditions</span><textarea name="terms" rows={5} maxLength={3000} defaultValue={data?.terms || ""} placeholder="Explain refundable conditions, permitted deductions, inspection and refund timing." /></label>
        <button className="button" type="submit">Save deposit policy</button>
      </form>
    </div>
  </DashboardShell>;
}
