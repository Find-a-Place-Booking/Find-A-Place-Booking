import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DELIVERIES = 750;
const MAX_BOOKINGS = 200;

type Delivery = {
  id: string;
  reservation_id: string | null;
  notification_type: string;
  recipient: string;
  status: string;
  attempt_count: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

type Reservation = {
  id: string;
  confirmation_code: string;
  property_id: string;
  status: string;
  payment_environment: string;
  payment_status: string;
  created_at: string;
};

type Property = { id: string; name: string };

type Check = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  guest: number;
  host: number;
  platform: number;
  platformExpected: number;
  missing: string[];
};

function dateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const n = Date.parse(value);
  return Number.isFinite(n)
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(n)
    : "Invalid timestamp";
}

function titleFor(type: string) {
  return type.replace(/^TEAM_/, "Platform copy: ").replaceAll("_", " ");
}

export default async function NotificationHealthPage() {
  const context = await getAdminContext();
  const allowed = hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"]);
  if (!allowed) {
    return (
      <AdminShell active="notification-health" eyebrow="Permissions" title="Email delivery checks" context={context}>
        <section className="panel"><p>Operations or super-admin access is required to review delivery records.</p></section>
      </AdminShell>
    );
  }

  const admin = createAdminClient();
  const now = Date.now();
  const since = new Date(now - 30 * ONE_DAY_MS).toISOString();
  const bookingSince = new Date(now - 60 * ONE_DAY_MS).toISOString();

  // These queries never retrieve email bodies or guest trip access links.
  const [deliveryResult, bookingResult, adminResult] = await Promise.all([
    admin.from("notification_deliveries")
      .select("id,reservation_id,notification_type,recipient,status,attempt_count,last_error,created_at,updated_at,sent_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(MAX_DELIVERIES),
    admin.from("reservations")
      .select("id,confirmation_code,property_id,status,payment_environment,payment_status,created_at")
      .eq("payment_environment", "LIVE").eq("status", "CONFIRMED")
      .gte("created_at", bookingSince).order("created_at", { ascending: false }).limit(MAX_BOOKINGS),
    admin.from("admin_users").select("profile_id").eq("status", "ACTIVE"),
  ]);

  const errors = [deliveryResult.error?.message, bookingResult.error?.message, adminResult.error?.message].filter(Boolean);
  if (errors.length) {
    console.error("[notification health] read-only query failed", errors);
    return (
      <AdminShell active="notification-health" eyebrow="Platform operations" title="Email delivery checks" context={context}>
        <section className="panel"><strong>Unable to load the delivery audit.</strong><p>Some read-only database queries failed. No emails were sent or changed. Please try again or check server logs.</p></section>
      </AdminShell>
    );
  }

  const deliveries = (deliveryResult.data ?? []) as Delivery[];
  const reservations = (bookingResult.data ?? []) as Reservation[];
  const adminIds = [...new Set((adminResult.data ?? []).map(row => row.profile_id).filter(Boolean))];
  const [profileResult, propertyResult] = await Promise.all([
    adminIds.length
      ? admin.from("profiles").select("id,email").in("id", adminIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null }[], error: null }),
    reservations.length
      ? admin.from("properties").select("id,name").in("id", [...new Set(reservations.map(r => r.property_id))])
      : Promise.resolve({ data: [] as Property[], error: null }),
  ]);
  if (profileResult.error || propertyResult.error) {
    console.error("[notification health] lookup failed", profileResult.error?.message, propertyResult.error?.message);
    return (
      <AdminShell active="notification-health" eyebrow="Platform operations" title="Email delivery checks" context={context}>
        <section className="panel"><p>Delivery records were loaded, but admin-recipient or property lookups failed. Please try again. No emails were changed.</p></section>
      </AdminShell>
    );
  }

  const teamRecipients = new Set((profileResult.data ?? []).map(row => String(row.email || "").toLowerCase()).filter(Boolean));
  const propertyNames = new Map((propertyResult.data ?? []).map(p => [p.id, p.name]));
  const byReservation = new Map<string, Delivery[]>();
  for (const delivery of deliveries) {
    if (!delivery.reservation_id) continue;
    const current = byReservation.get(delivery.reservation_id) ?? [];
    current.push(delivery);
    byReservation.set(delivery.reservation_id, current);
  }

  const checks: Check[] = reservations
    .filter(r => now - Date.parse(r.created_at) >= 10 * 60_000)
    .map(reservation => {
      const rows = byReservation.get(reservation.id) ?? [];
      const sent = (type: string) => rows.filter(row => row.notification_type === type && row.status === "SENT");
      const guest = sent("GUEST_BOOKING_CONFIRMED").length;
      const host = sent("HOST_NEW_BOOKING").length;
      const platform = new Set(sent("TEAM_HOST_NEW_BOOKING").map(row => row.recipient.toLowerCase()).filter(email => teamRecipients.has(email))).size;
      const missing = [
        ...(guest ? [] : ["Guest confirmation not recorded"]),
        ...(host ? [] : ["Host confirmation not recorded"]),
        ...(teamRecipients.size && platform < teamRecipients.size ? [`Platform copies recorded: ${platform}/${teamRecipients.size}`] : []),
      ];
      return {
        id: reservation.id, code: reservation.confirmation_code,
        name: propertyNames.get(reservation.property_id) ?? "Property",
        createdAt: reservation.created_at,
        guest, host, platform, platformExpected: teamRecipients.size, missing,
      };
    });
  const gaps = checks.filter(check => check.missing.length > 0);
  const failed = deliveries.filter(row => row.status === "FAILED");
  const pendingOverdue = deliveries.filter(row => row.status === "PENDING" && now - Date.parse(row.updated_at) > 20 * 60_000);
  const sentCount = deliveries.filter(row => row.status === "SENT").length;
  const teamCount = deliveries.filter(row => row.status === "SENT" && row.notification_type.startsWith("TEAM_")).length;
  const sampleLimited = deliveries.length >= MAX_DELIVERIES || reservations.length >= MAX_BOOKINGS;

  return (
    <AdminShell active="notification-health" eyebrow="Read-only platform operations" title="Email delivery checks" context={context}>
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Booking notification monitoring</p><h2>Delivery records and missing copies</h2></div><Link href="/admin/reservations">Open reservations →</Link></div>
        <p className="muted">Checks the last 30 days of notification delivery records and confirmed live bookings created within 60 days. A SENT status means the email provider accepted the message; it does not guarantee inbox delivery. This page never sends, retries, or changes an email.</p>
        <div className="metrics dash-grid">
          <div><span>Marked sent</span><strong>{sentCount}</strong><small>Past 30 days</small></div>
          <div><span>Failed / overdue</span><strong>{failed.length + pendingOverdue.length}</strong><small>{failed.length} failed · {pendingOverdue.length} pending over 20 min</small></div>
          <div><span>Platform copies</span><strong>{teamCount}</strong><small>{teamRecipients.size} currently active admin email recipients</small></div>
          <div><span>Booking copy gaps</span><strong>{gaps.length}</strong><small>{checks.length} recent confirmed live bookings checked</small></div>
        </div>
        {sampleLimited ? <p className="muted">This audit reached a read limit. Older deliveries may not be represented; do not treat missing records as proven delivery failures.</p> : null}
        {!teamRecipients.size ? <p className="muted">No active admin email addresses were found. Platform-copy coverage cannot be assessed until admin configuration is checked.</p> : null}
      </section>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Needs review</p><h2>Confirmed booking email gaps</h2></div></div>
        <p className="muted">Only live, confirmed reservations are shown. A missing audit record can reflect a legacy booking or a record outside the 30-day delivery window. No automatic resend is triggered.</p>
        {gaps.length ? <div className="admin-list compact">{gaps.map(check => (
          <div className="admin-list-row static" key={check.id}>
            <span>
              <strong>{check.name} · {check.code}</strong>
              <small>Booked: {dateTime(check.createdAt)}</small>
              <small>Guest: {check.guest} · Host: {check.host} · Platform: {check.platform}/{check.platformExpected}</small>
              <small>{check.missing.join(" · ")}</small>
            </span>
            <span><em className="pending">CHECK</em><Link href={`/admin/reservations/${check.id}`}>Review booking →</Link></span>
          </div>
        ))}</div> : <p className="muted">No missing booking notification records found in the checked window.</p>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Send failures</p><h2>Failed and overdue pending emails</h2></div></div>
        {[...failed, ...pendingOverdue].length ? <div className="admin-list compact">{[...failed, ...pendingOverdue].slice(0, 75).map(row => (
          <div className="admin-list-row static" key={row.id}>
            <span>
              <strong>{titleFor(row.notification_type)}</strong>
              <small>Recipient: {row.recipient} · {dateTime(row.created_at)}</small>
              <small>Attempts: {row.attempt_count ?? 0} · {row.last_error?.slice(0, 240) || "No provider error recorded"}</small>
            </span>
            <span><em className="pending">{row.status === "FAILED" ? "FAILED" : "OVERDUE"}</em>{row.reservation_id ? <Link href={`/admin/reservations/${row.reservation_id}`}>Booking →</Link> : null}</span>
          </div>
        ))}</div> : <p className="muted">No failed or overdue pending delivery rows in the checked window.</p>}
      </section>
      <section className="panel"><p className="muted">For troubleshooting: notification retries are handled by the existing notifications cron, subject to the current retry rules. The audit does not modify those rules, resend messages, or expose stored email bodies or guest trip tokens.</p></section>
    </AdminShell>
  );
}
