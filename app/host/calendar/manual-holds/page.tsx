import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getCalendarWorkspace } from "@/lib/host/calendar";
import { getResNexusBrowserAccounts } from "@/lib/host/resnexus-browser";
import { createClient } from "@/lib/supabase/server";

import { createManualHold, releaseManualHold } from "./actions";
import styles from "./manual-holds.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Hold = {
  id: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  label: string | null;
};

function todayInChicago() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function printDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function sourceNeedsAttention(account: {
  status: string;
  lastSuccessAt: string | null;
  syncIntervalMinutes: number;
}, now: number) {
  if (account.status !== "CONNECTED") return true;
  const last = account.lastSuccessAt ? Date.parse(account.lastSuccessAt) : NaN;
  const allowed = (Math.max(30, account.syncIntervalMinutes || 60) * 2 + 60) * 60_000;
  return !Number.isFinite(last) || now - last > allowed;
}

export default async function ManualHoldsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; message?: string }>;
}) {
  const [{ result, message }, workspace, accounts] = await Promise.all([
    searchParams,
    getCalendarWorkspace({}),
    getResNexusBrowserAccounts(),
  ]);
  const today = todayInChicago();
  const now = Date.now();
  const needsAttention = accounts.filter((account) => sourceNeedsAttention(account, now));
  const targets = workspace.targets;
  const unitIds = targets.map((target) => target.unitId);
  let holds: Hold[] = [];
  let loadError = false;
  if (unitIds.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("availability_blocks")
      .select("id,unit_id,start_date,end_date,label")
      .in("unit_id", unitIds)
      .eq("block_type", "OWNER_BLOCK")
      .eq("state", "ACTIVE")
      .gt("end_date", today)
      .order("start_date", { ascending: true })
      .limit(1000);
    if (error) loadError = true;
    else holds = (data ?? []) as Hold[];
  }
  const byId = new Map(targets.map((target) => [target.unitId, target]));

  return (
    <DashboardShell active="Manual holds" eyebrow="Direct booking and calendar safety" title="Manual booking holds">
      <p className={styles.note}>
        Hold dates for a phone booking, owner stay, maintenance, or an outside reservation not yet on your connected calendars.
        A hold blocks <strong>Find A Place availability</strong> until you release it. It does not create a reservation or charge a guest.
      </p>
      {result === "created" ? <div role="status" className={styles.success}>Dates blocked successfully. They are no longer available for new Find A Place checkouts.</div> : null}
      {result === "released" ? <div role="status" className={styles.success}>Manual hold released. The dates are now subject to the other calendar sources and reservation blocks.</div> : null}
      {result === "error" ? <div role="alert" className={styles.status}>{message || "The calendar could not be updated."}</div> : null}

      {needsAttention.length > 0 ? (
        <section className="panel" aria-label="ResNexus synchronization attention">
          <div className="panel-head"><div><p className="eyebrow dark">Calendar connection warning</p><h2>Check these ResNexus calendars before accepting new dates</h2></div></div>
          <p className={styles.help}>A connected status does not guarantee a recent successful scan. Please compare open dates directly with ResNexus until the worker is current.</p>
          {needsAttention.map((account) => (
            <div className={styles.warning} key={account.id}>
              <strong>{account.label} · {account.status === "CONNECTED" ? "Sync overdue" : account.status.replaceAll("_", " ")}</strong>
              <p>Last successful scan: {account.lastSuccessAt ? new Date(account.lastSuccessAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }) : "Never"}.</p>
              {account.attentionMessage ? <p>{account.attentionMessage}</p> : null}
              <Link href="/host/integrations/resnexus">Check connection and login →</Link>
            </div>
          ))}
        </section>
      ) : null}

      <div className={styles.layout}>
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow dark">Block nights</p><h2>Add a manual hold</h2></div></div>
          {targets.length === 0 ? (
            <p>No active property units yet. <Link href="/host/properties">Set up a property</Link> first.</p>
          ) : (
            <form action={createManualHold} className={styles.form}>
              <label className={styles.field}>Property or unit
                <select name="unitId" required defaultValue={targets[0].unitId}>
                  {targets.map((target) => <option key={target.unitId} value={target.unitId}>{target.propertyName}{target.unitName !== target.propertyName ? ` · ${target.unitName}` : ""}</option>)}
                </select>
              </label>
              <div className={styles.dates}>
                <label className={styles.field}>First unavailable night (check-in)
                  <input type="date" name="start" min={today} required />
                </label>
                <label className={styles.field}>First available day (checkout)
                  <input type="date" name="end" min={today} required />
                </label>
              </div>
              <label className={styles.field}>Internal reason or note
                <input name="label" maxLength={180} placeholder="Phone booking, maintenance, owner stay…" autoComplete="off" />
              </label>
              <p className={styles.help}>Dates follow normal checkout rules: an arrival on the checkout day is allowed. Existing bookings, active holds, and imported blocks are checked again on the server before anything is saved.</p>
              <div className={styles.actions}>
                <button type="submit" className="button">Block these dates</button>
                <Link href="/host/calendar">Open detailed calendar</Link>
              </div>
            </form>
          )}
        </section>

        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow dark">Existing holds</p><h2>Upcoming manual blocks ({holds.length})</h2></div></div>
          {loadError ? <p role="alert">Could not load your active holds. Refresh this page before changing anything.</p> : null}
          {!loadError && holds.length === 0 ? <p className={styles.note}>No upcoming manual holds. Imported external bookings and Find A Place reservations are managed separately.</p> : null}
          {holds.map((hold) => {
            const unit = byId.get(hold.unit_id);
            return (
              <div key={hold.id} className={styles.hold}>
                <strong>{unit?.propertyName || "Property"}{unit && unit.unitName !== unit.propertyName ? ` · ${unit.unitName}` : ""}</strong>
                <span>{printDate(hold.start_date)} – {printDate(hold.end_date)}</span>
                <small>{hold.label || "Manual hold"}</small>
                <details>
                  <summary className={styles.help}>Release these dates</summary>
                  <form action={releaseManualHold} className={styles.form} style={{ paddingTop: 10 }}>
                    <input type="hidden" name="unitId" value={hold.unit_id} />
                    <input type="hidden" name="blockId" value={hold.id} />
                    <label className={styles.confirm}><input type="checkbox" name="confirmed" value="yes" required /> I've checked that these nights can safely reopen to new bookings.</label>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.release}>Confirm: release hold</button>
                      <Link href={`/host/calendar?unit=${encodeURIComponent(hold.unit_id)}&month=${encodeURIComponent(hold.start_date.slice(0, 7))}`}>Review unit calendar</Link>
                    </div>
                  </form>
                </details>
              </div>
            );
          })}
          {holds.length === 1000 ? <p className={styles.help}>Showing the first 1,000 upcoming holds. Please contact support to review additional holds.</p> : null}
        </section>
      </div>
      <p className={styles.note}><strong>Important:</strong> Manual holds here protect only the Find A Place calendar. They are not sent back to ResNexus, Airbnb, or Vrbo. Keep your other channel calendars current to prevent outside double bookings.</p>
    </DashboardShell>
  );
}
