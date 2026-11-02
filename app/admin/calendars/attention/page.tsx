import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type WorkerAccount = {
  id: string;
  label: string | null;
  status: string;
  attention_code: string | null;
  attention_message: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_sync_at: string | null;
  consecutive_failures: number | null;
  sync_interval_minutes: number | null;
};

type WorkerMapping = {
  browser_account_id: string;
  unit_id: string;
  status: string;
};

type Property = {
  id: string;
  name: string;
  status: string;
  live_checkout_enabled: boolean;
};

type Unit = {
  id: string;
  property_id: string;
  name: string;
  is_active: boolean;
};

type Connection = {
  id: string;
  unit_id: string;
  provider: string;
  connection_kind: string;
  sync_status: string;
  last_success_at: string | null;
};

type Block = {
  unit_id: string;
  reservation_id: string | null;
  block_type: string;
  start_date: string;
  end_date: string;
};

type Reservation = {
  id: string;
  property_id: string;
  unit_id: string;
  confirmation_code: string;
  check_in: string;
  check_out: string;
  payment_status: string;
};

function showDate(date: string | null) {
  if (!date) return "Never";
  const millis = Date.parse(date);
  if (!Number.isFinite(millis)) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(millis));
}

function howLongAgo(date: string | null, now: number) {
  if (!date) return "Never synchronized";
  const value = Date.parse(date);
  if (!Number.isFinite(value)) return "Unknown sync time";
  const hours = Math.max(0, Math.floor((now - value) / 3_600_000));
  return hours < 1 ? "Less than an hour ago" : `${hours}h ago`;
}

function isWorkerOverdue(worker: WorkerAccount, now: number) {
  const last = worker.last_success_at ? Date.parse(worker.last_success_at) : NaN;
  const cadenceMinutes = Math.max(30, worker.sync_interval_minutes ?? 60);
  // Give the worker two scheduled runs plus one hour of grace to recover.
  return !Number.isFinite(last) || now - last > (cadenceMinutes * 2 + 60) * 60_000;
}

function sameDatesBlock(reservation: Reservation, block: Block) {
  return block.reservation_id === reservation.id &&
    block.unit_id === reservation.unit_id &&
    block.block_type === "INTERNAL_RESERVATION" &&
    block.start_date <= reservation.check_in &&
    block.end_date >= reservation.check_out;
}

function overlaps(first: Reservation, second: Reservation) {
  return first.unit_id === second.unit_id &&
    first.id !== second.id &&
    first.check_in < second.check_out &&
    second.check_in < first.check_out;
}

export default async function CalendarAttentionPage() {
  const context = await getAdminContext();
  const canReview = hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"]);
  if (!canReview) {
    return (
      <AdminShell active="calendars" eyebrow="Booking safety" title="Calendar attention" context={context}>
        <section className="panel">
          <p>This read-only operations review is available to Super and Operations Admins.</p>
          <Link href="/admin/calendars">Back to calendars</Link>
        </section>
      </AdminShell>
    );
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  // Select only health metadata. Never fetch encrypted logins, session cookies,
  // private feed URLs, or guest contact details into the page.
  const [accountsResult, mappingsResult, propertiesResult, unitsResult,
    connectionsResult, blocksResult, reservationsResult] = await Promise.all([
    admin.from("resnexus_browser_accounts")
      .select("id,label,status,attention_code,attention_message,last_attempt_at,last_success_at,next_sync_at,consecutive_failures,sync_interval_minutes")
      .limit(100),
    admin.from("resnexus_resource_mappings")
      .select("browser_account_id,unit_id,status")
      .limit(1000),
    admin.from("properties")
      .select("id,name,status,live_checkout_enabled")
      .eq("status", "PUBLISHED")
      .eq("live_checkout_enabled", true)
      .limit(500),
    admin.from("property_units")
      .select("id,property_id,name,is_active")
      .eq("is_active", true)
      .limit(1000),
    admin.from("calendar_connections")
      .select("id,unit_id,provider,connection_kind,sync_status,last_success_at")
      .eq("is_active", true)
      .limit(1000),
    admin.from("availability_blocks")
      .select("unit_id,reservation_id,block_type,start_date,end_date")
      .eq("state", "ACTIVE")
      .gte("end_date", today)
      .limit(1000),
    admin.from("reservations")
      .select("id,property_id,unit_id,confirmation_code,check_in,check_out,payment_status")
      .eq("status", "CONFIRMED")
      .eq("payment_environment", "LIVE")
      .gte("check_out", today)
      .limit(1000),
  ]);

  const queryErrors = [accountsResult, mappingsResult, propertiesResult, unitsResult,
    connectionsResult, blocksResult, reservationsResult]
    .filter((result) => result.error)
    .map((result) => result.error?.message)
    .filter(Boolean);

  if (queryErrors.length) {
    console.error("[calendar attention] read-only diagnostic query failed", queryErrors);
    return (
      <AdminShell active="calendars" eyebrow="Booking safety" title="Calendar attention" context={context}>
        <section className="panel">
          <h2>Unable to finish the safety review</h2>
          <p>One or more read-only database queries failed. No booking or calendar data was changed.</p>
          <Link href="/admin/calendars">Back to calendars</Link>
        </section>
      </AdminShell>
    );
  }

  const accounts = (accountsResult.data ?? []) as WorkerAccount[];
  const mappings = (mappingsResult.data ?? []) as WorkerMapping[];
  const properties = (propertiesResult.data ?? []) as Property[];
  const units = (unitsResult.data ?? []) as Unit[];
  const connections = (connectionsResult.data ?? []) as Connection[];
  const blocks = (blocksResult.data ?? []) as Block[];
  const reservations = (reservationsResult.data ?? []) as Reservation[];

  // Do not silently label an incomplete paginated query "all clear".
  const mightBeTruncated = accounts.length === 100 || mappings.length === 1000 ||
    properties.length === 500 || units.length === 1000 ||
    connections.length === 1000 || blocks.length === 1000 ||
    reservations.length === 1000;

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const connectionUnitIds = new Set(connections.map((connection) => connection.unit_id));
  const futureBlocks = new Map<string, Block[]>();
  for (const block of blocks) {
    const existing = futureBlocks.get(block.unit_id) ?? [];
    existing.push(block);
    futureBlocks.set(block.unit_id, existing);
  }

  const liveUnits = units.filter((unit) => propertyById.has(unit.property_id));
  const manualOnly = liveUnits.filter((unit) => !connectionUnitIds.has(unit.id));
  const missingReservationBlocks = reservations.filter((reservation) =>
    !(futureBlocks.get(reservation.unit_id) ?? []).some((block) => sameDatesBlock(reservation, block)),
  );
  const conflicts: [Reservation, Reservation][] = [];
  for (let i = 0; i < reservations.length; i++) {
    for (let j = i + 1; j < reservations.length; j++) {
      if (overlaps(reservations[i], reservations[j])) {
        conflicts.push([reservations[i], reservations[j]]);
      }
    }
  }
  const workerWarnings = accounts.filter((account) =>
    account.status !== "CONNECTED" || isWorkerOverdue(account, now),
  );

  const propertyLabel = (propertyId: string) => propertyById.get(propertyId)?.name ?? "Property";
  const mappedCount = (accountId: string) => mappings.filter((mapping) =>
    mapping.browser_account_id === accountId && mapping.status === "ACTIVE",
  ).length;

  return (
    <AdminShell active="calendars" eyebrow="Read-only live checks" title="Calendar attention" context={context}>
      <section className="panel">
        <p className="muted">
          These checks read live availability and synchronization metadata. They never modify calendar blocks,
          run worker jobs, cancel reservations, or collect guest or host credentials.
        </p>
        <Link href="/admin/calendars">← Back to calendar operations</Link>
        {mightBeTruncated ? (
          <p role="alert"><strong>Some data reached the display limit.</strong> Review results as partial, not a complete safety check.</p>
        ) : null}
      </section>

      <div className="metrics dash-grid">
        <div><span>ResNexus worker alerts</span><strong>{workerWarnings.length}</strong><small>{accounts.length} account(s) inspected</small></div>
        <div><span>Manual-only live units</span><strong>{manualOnly.length}</strong><small>No active external calendar source</small></div>
        <div><span>Future booking block gaps</span><strong>{missingReservationBlocks.length}</strong><small>{reservations.length} confirmed live future reservations</small></div>
        <div><span>Overlapping paid bookings</span><strong>{conflicts.length}</strong><small>Same unit and overlapping dates</small></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">ResNexus</p><h2>Browser-worker health</h2></div></div>
        <p className="muted">
          The last result may still say Healthy even when the worker is not running.
          Flagging uses two sync intervals plus a one-hour grace period.
        </p>
        {accounts.length ? (
          <div className="admin-list compact">
            {accounts.map((account) => {
              const overdue = isWorkerOverdue(account, now);
              const attention = overdue || account.status !== "CONNECTED";
              return (
                <div className="admin-list-row static" key={account.id}>
                  <span>
                    <strong>{account.label || "ResNexus account"}</strong>
                    <small>{mappedCount(account.id)} active unit mapping(s) · Last success: {showDate(account.last_success_at)} ({howLongAgo(account.last_success_at, now)})</small>
                    <small>Last attempt: {showDate(account.last_attempt_at)} · Next scheduled: {showDate(account.next_sync_at)}</small>
                    {account.attention_code ? <small>Attention: {account.attention_code.replaceAll("_", " ")}</small> : null}
                    {account.attention_message ? <small>{account.attention_message.slice(0, 250)}</small> : null}
                  </span>
                  <span><em className={attention ? "pending" : ""}>{attention ? overdue ? "OVERDUE" : "NEEDS ATTENTION" : "CURRENT"}</em></span>
                </div>
              );
            })}
          </div>
        ) : <p>No ResNexus browser accounts are configured.</p>}
        <p className="muted">An overdue worker needs its external worker service checked. Rejected credentials must be corrected through the authorized host connection flow; this screen cannot repair either automatically.</p>
      </section>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Published listings</p><h2>Manual calendar coverage</h2></div></div>
        <p className="muted">
          These bookable units have no active external calendar connection. This can be intentional,
          but the host must actively maintain owner blocks and confirm dates against other channels.
        </p>
        {manualOnly.length ? (
          <div className="admin-list compact">
            {manualOnly.slice(0, 75).map((unit) => {
              const ownerBlocks = (futureBlocks.get(unit.id) ?? []).filter((block) => block.block_type === "OWNER_BLOCK").length;
              return (
                <div className="admin-list-row static" key={unit.id}>
                  <span><strong>{propertyLabel(unit.property_id)}</strong><small>{unit.name} · {ownerBlocks} future owner block(s)</small></span>
                  <Link href={`/admin/properties/${unit.property_id}`}>Review property →</Link>
                </div>
              );
            })}
          </div>
        ) : <p>No manual-only published units found within the inspected records.</p>}
      </section>

      <section className="panel" aria-label="Live booking calendar cross-check">
        <div className="panel-head"><div><p className="eyebrow dark">Live reservations</p><h2>Confirmed booking block protection</h2></div></div>
        <p className="muted">
          Every future confirmed live reservation should have an active internal reservation block covering
          check-in through checkout. This also checks for two confirmed reservations occupying the same unit at once.
        </p>
        {missingReservationBlocks.length ? (
          <div className="admin-list compact">
            {missingReservationBlocks.slice(0, 50).map((reservation) => (
              <div className="admin-list-row static" key={reservation.id}>
                <span>
                  <strong>Calendar block needs review · {propertyLabel(reservation.property_id)}</strong>
                  <small>{reservation.confirmation_code} · {reservation.check_in} to {reservation.check_out} · {reservation.payment_status}</small>
                </span>
                <Link href={`/admin/reservations/${reservation.id}`}>Review reservation →</Link>
              </div>
            ))}
          </div>
        ) : <p>No missing future live reservation blocks were found in the inspected records.</p>}
        {conflicts.length ? (
          <div className="admin-list compact">
            {conflicts.slice(0, 30).map(([first, second]) => (
              <div className="admin-list-row static" key={`${first.id}-${second.id}`}>
                <span>
                  <strong>Overlapping confirmed bookings · {propertyLabel(first.property_id)}</strong>
                  <small>{first.confirmation_code} ({first.check_in}–{first.check_out}) and {second.confirmation_code} ({second.check_in}–{second.check_out})</small>
                </span>
                <Link href={`/admin/reservations/${first.id}`}>Review bookings →</Link>
              </div>
            ))}
          </div>
        ) : <p>No overlapping future confirmed live reservations were found in the inspected records.</p>}
      </section>
    </AdminShell>
  );
}
