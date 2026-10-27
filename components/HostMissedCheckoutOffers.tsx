import Link from "next/link";

import { getManagedOrganizations } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

import styles from "./HostMissedCheckoutOffers.module.css";

type AttemptRow = {
  id: string;
  property_id: string;
  unit_id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_total_cents: number;
  currency: string;
  check_in: string;
  check_out: string;
  status: string;
  payment_status: string;
  created_at: string;
};
type OfferSettingsRow = {
  property_id: string;
  is_enabled: boolean;
  offer_mode: string;
};

const recoverable = new Set(["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"]);
const paid = new Set(["SUCCEEDED", "PROCESSING", "REFUNDED", "DISPUTED"]);

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" })
    .format(Number(cents || 0) / 100);
}

function date(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

function stayKey(row: AttemptRow) {
  return `${row.guest_email?.trim().toLowerCase() ?? ""}|${row.unit_id}|${row.check_in}|${row.check_out}`;
}

/** Host-only UI; no service-role reads and no modification to checkout or holds. */
export async function HostMissedCheckoutOffers({ compact = false }: { compact?: boolean }) {
  // This optional widget must never take down the main host dashboard.
  let organizations: Awaited<ReturnType<typeof getManagedOrganizations>>;
  try {
    organizations = await getManagedOrganizations();
  } catch (error) {
    console.error("[host missed checkouts] membership lookup failed", error instanceof Error ? error.name : "unknown");
    return null;
  }
  const organizationIds = organizations.map((organization) => organization.id);
  if (!organizationIds.length) return null;

  const supabase = await createClient();
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("reservations")
    .select("id,property_id,unit_id,guest_name,guest_email,guest_total_cents,currency,check_in,check_out,status,payment_status,created_at")
    .in("organization_id", organizationIds)
    .eq("payment_environment", "LIVE")
    .not("guest_email", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("[host missed checkouts] unable to load attempts", error.code);
    return null; // Never break the rest of the host dashboard.
  }

  const recent = (rows ?? []) as AttemptRow[];
  const unfinished = recent.filter((row) => recoverable.has(row.status) && !paid.has(row.payment_status));
  if (!unfinished.length) return null;

  const distinct = new Map<string, AttemptRow>();
  const completed = new Set(
    recent.filter((row) => row.status === "CONFIRMED" || paid.has(row.payment_status)).map(stayKey),
  );
  for (const row of unfinished) {
    const key = stayKey(row);
    if (!distinct.has(key)) distinct.set(key, row); // Newest attempt per guest, stay and dates.
  }
  const candidates = [...distinct.values()];
  const propertyIds = [...new Set(candidates.map((row) => row.property_id))];
  const [propertiesResult, settingsResult] = await Promise.all([
    supabase.from("properties").select("id,name").in("id", propertyIds),
    supabase.from("booking_recovery_settings")
      .select("property_id,is_enabled,offer_mode").in("property_id", propertyIds),
  ]);
  const propertyName = new Map((propertiesResult.data ?? []).map((row) => [row.id, row.name]));
  const settings = new Map(
    ((settingsResult.data ?? []) as OfferSettingsRow[]).map((row) => [row.property_id, row]),
  );
  const today = new Date().toISOString().slice(0, 10);
  const eligible = candidates.filter((row) =>
    row.check_in > today &&
    !completed.has(stayKey(row)) &&
    Boolean(settings.get(row.property_id)?.is_enabled) &&
    settings.get(row.property_id)?.offer_mode !== "OFF",
  );
  // Surface the entries with an actionable next step first, including on mobile.
  const eligibleIds = new Set(eligible.map((row) => row.id));
  const ordered = [...eligible, ...candidates.filter((row) => !eligibleIds.has(row.id))];
  const displayed = compact ? ordered.slice(0, 5) : ordered.slice(0, 100);

  return (
    <section className={styles.section} aria-label="Unfinished checkout opportunities">
      <div className={styles.head}>
        <div>
          <p className={styles.kicker}>Booking recovery</p>
          <h2>Unfinished checkouts</h2>
          <p className={styles.subhead}>
            Review the guest's original dates and total. Offer a personal discount where available.
          </p>
        </div>
        <span className={styles.counter}>{eligible.length} to review</span>
      </div>
      <div className={styles.list}>
        {displayed.map((row) => {
          const settingsForProperty = settings.get(row.property_id);
          const finished = completed.has(stayKey(row));
          const allowed = eligibleIds.has(row.id);
          const reason = finished
            ? "Already booked"
            : row.check_in <= today
              ? "Dates passed"
              : !settingsForProperty?.is_enabled || settingsForProperty.offer_mode === "OFF"
                ? "Recovery disabled"
                : "Check offer eligibility";
          return (
            <div className={styles.item} key={row.id}>
              <div className={styles.col}>
                <strong>{row.guest_name?.trim() || "Guest"}</strong>
                <small>{row.guest_email}</small>
                <small>{propertyName.get(row.property_id) || "Property"}</small>
              </div>
              <div className={styles.col}>
                <strong>{date(row.check_in)} – {date(row.check_out)}</strong>
                <small>Unfinished checkout · {row.status.toLowerCase().replaceAll("_", " ")}</small>
              </div>
              <div className={styles.col}>
                <strong className={styles.money}>{money(row.guest_total_cents, row.currency)}</strong>
                <small>Original guest total</small>
              </div>
              {allowed ? (
                <Link className={styles.action} href={`/host/recovery/individual/${encodeURIComponent(row.id)}`}>
                  Offer % off
                </Link>
              ) : (
                <span className={styles.noAction}>{reason}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className={styles.foot}>
        {unfinished.length} checkout record{unfinished.length === 1 ? "" : "s"} · {candidates.length} distinct guest/date combination{candidates.length === 1 ? "" : "s"} in the last 120 days. Offers are not sent until you choose a percentage and approve them. Availability and previous emails are checked again before sending.
      </p>
      {compact && ordered.length > displayed.length ? (
        <Link className={styles.more} href="/host/reservations">View all unfinished checkouts →</Link>
      ) : null}
      {compact && ordered.length <= displayed.length ? (
        <Link className={styles.more} href="/host/recovery">Booking recovery settings →</Link>
      ) : null}
    </section>
  );
}
