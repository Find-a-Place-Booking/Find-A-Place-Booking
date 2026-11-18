import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rentalSignatureEnabled } from "@/lib/policies/rental-signature-toggle";

export default async function HostGuestAgreementsPage() {
  if (!rentalSignatureEnabled()) return <DashboardShell active="Reservations" title="Guest rental agreements"><p>Electronic signature records are not enabled for this deployment yet. Existing policy acceptance still works.</p></DashboardShell>;
  const properties = await getHostProperties();
  const accessibleUnitIds = new Set(properties.map(p => p.unitId));
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return <DashboardShell active="Reservations" title="Guest agreements"><p>Sign in to view agreements.</p></DashboardShell>;
  const { data: reservations, error } = accessibleUnitIds.size ? await client.from("reservations")
    .select("id,property_id,unit_id,confirmation_code,guest_name,check_in,check_out,status")
    .in("unit_id", [...accessibleUnitIds]).order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  const permitted = (reservations || []).filter(r => accessibleUnitIds.has(r.unit_id));
  const reservationIds = permitted.map(r => r.id);
  const admin = createAdminClient();
  const { data: acceptances } = reservationIds.length
    ? await admin.from("reservation_policy_acceptances")
      .select("reservation_id,accepted_at,typed_signature_name,typed_signature_at,typed_signature_document_id,typed_signature_document_version,electronic_signature_consent")
      .in("reservation_id", reservationIds)
    : { data: [] };
  const byReservation = new Map((acceptances || []).map(a => [a.reservation_id, a]));
  const ids = [...new Set((acceptances || []).flatMap(a => a.typed_signature_document_id ? [a.typed_signature_document_id] : []))];
  const { data: docs } = ids.length ? await admin.from("property_policy_documents")
    .select("id,property_id,storage_path,original_name").in("id", ids) : { data: [] };
  const docById = new Map((docs || []).map(d => [d.id, d]));
  const urls = new Map<string, string>();
  for (const doc of docs || []) {
    const { data } = await admin.storage.from("property-documents").createSignedUrl(doc.storage_path, 900);
    if (data?.signedUrl) urls.set(doc.id, data.signedUrl);
  }
  return <DashboardShell active="Reservations" title="Guest rental agreements">
    <p><Link href="/host/reservations">← Reservations</Link></p>
    <p className="muted">Booking-specific electronic signatures are tied to the exact host PDF version shown to the guest before payment. This page shows the evidence record and the corresponding original PDF; it does not edit the document or replace a legally signed PDF with a fabricated copy.</p>
    {error ? <p className="admin-message error">Could not load your reservations.</p> : null}
    {permitted.length === 0 ? <section className="panel">No reservations to display.</section> :
      permitted.map(r => {
        const a = byReservation.get(r.id);
        const doc = a?.typed_signature_document_id ? docById.get(a.typed_signature_document_id) : null;
        const docUrl = doc && doc.property_id === r.property_id ? urls.get(doc.id) : undefined;
        return <section className="panel" key={r.id}>
          <strong>{r.guest_name || "Guest"} · {r.confirmation_code}</strong>
          <p>{r.check_in} – {r.check_out}</p>
          {a?.typed_signature_at && a.electronic_signature_consent
            ? <p><strong>Electronically signed:</strong> {a.typed_signature_name} · {new Date(a.typed_signature_at).toLocaleString("en-US")}</p>
            : <p>Signed rental agreement: Not on record {a?.accepted_at ? "(general booking policies accepted)" : ""}</p>}
          {docUrl ? <a href={docUrl} target="_blank" rel="noreferrer">View host PDF version {a?.typed_signature_document_version ?? ""}{doc?.original_name ? ` · ${doc.original_name}` : ""} →</a> : null}
        </section>;
      })}
  </DashboardShell>;
}
