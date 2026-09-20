import Link from "next/link";

import { CalendarCopyButton } from "@/components/CalendarCopyButton";
import { DashboardShell } from "@/components/DashboardShell";
import {
  calendarExportUrl,
  calendarMoney,
  calendarProviderLabel,
  getCalendarWorkspace,
  type AvailabilityBlockRecord,
} from "@/lib/host/calendar";
import {
  cancelOwnerBlock,
  connectIcalCalendar,
  createOwnerBlock,
  disconnectCalendar,
  ensureGeneralExport,
  rotateExportToken,
  syncIcalCalendar,
  testIcalCalendar,
} from "./actions";
import styles from "./calendar.module.css";
import diagnosticStyles from "./diagnostics.module.css";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function blockClass(block: AvailabilityBlockRecord) {
  if (block.block_type === "OWNER_BLOCK") return `${styles.chip} ${styles.owner}`;
  if (block.block_type === "INTERNAL_RESERVATION") return `${styles.chip} ${styles.reservation}`;
  if (block.block_type === "INTERNAL_HOLD") return `${styles.chip} ${styles.hold}`;
  return `${styles.chip} ${styles.external}`;
}

function blockLabel(block: AvailabilityBlockRecord, connectionNames: Map<string, string>) {
  if (block.block_type === "OWNER_BLOCK") return block.label || "Owner block";
  if (block.block_type === "INTERNAL_RESERVATION") return "Find A Place reservation";
  if (block.block_type === "INTERNAL_HOLD") return "Checkout hold";
  if (block.connection_id) return connectionNames.get(block.connection_id) || block.label || "External calendar";
  return block.label || "Unavailable";
}

function displayDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function displayTimestamp(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function targetLabel(target: { propertyName: string; unitName: string; isPrimary: boolean }) {
  if (target.isPrimary && target.propertyName.trim().toLowerCase() === target.unitName.trim().toLowerCase()) return target.propertyName;
  return `${target.propertyName} · ${target.unitName}`;
}

function resultMessage(result?: string, detail?: string) {
  if (!result) return null;
  if (detail) return detail;
  const messages: Record<string, string> = {
    "owner-block-created": "Dates blocked on the canonical calendar.",
    "owner-block-removed": "Owner block removed.",
    "calendar-connected": "Calendar connected and synchronized.",
    "calendar-synced": "Calendar synchronized.",
    "calendar-test-ok": "Calendar connection test passed. No availability was changed.",
    "calendar-test-error": "Calendar connection test found a compatibility problem. No availability was changed.",
    "calendar-disconnected": "Calendar disconnected.",
    "export-created": "Calendar export created.",
    "export-rotated": "Calendar export URL rotated.",
  };
  return messages[result] ?? "Calendar updated.";
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; month?: string; result?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getCalendarWorkspace({ unitId: params.unit, month: params.month });
  const message = resultMessage(params.result, params.detail);
  const isError =
    params.result === "error" ||
    params.result === "connected-sync-error" ||
    params.result === "calendar-test-error";

  if (!workspace.selected) {
    return (
      <DashboardShell active="Calendar" title="Calendar">
        <section className={`panel ${styles.empty}`}>
          <h2>No rentable unit is ready for a calendar yet.</h2>
          <p>Create the first property/unit before connecting external calendars or blocking dates.</p>
          <Link className="button" href="/host/properties">Go to properties</Link>
        </section>
      </DashboardShell>
    );
  }

  const selected = workspace.selected;
  const now = Date.now();
  const activeBlocks = workspace.blocks.filter((block) => block.block_type !== "INTERNAL_HOLD" || !block.expires_at || new Date(block.expires_at).getTime() > now);
  const pricingByDate = new Map(workspace.pricingDays.map((price) => [price.stay_date, price]));
  const connectionNames = new Map(workspace.connections.map((connection) => [connection.id, calendarProviderLabel(connection.provider)]));
  const blocksByDate = new Map<string, AvailabilityBlockRecord[]>();
  for (const day of workspace.days) {
    blocksByDate.set(day.date, activeBlocks.filter((block) => block.start_date <= day.date && block.end_date > day.date));
  }

  const currentMonthDays = workspace.days.filter((day) => day.inMonth);
  const blockedCurrentDays = currentMonthDays.filter((day) => (blocksByDate.get(day.date)?.length ?? 0) > 0).length;
  const conflictCurrentDays = currentMonthDays.filter((day) => (blocksByDate.get(day.date)?.length ?? 0) > 1).length;
  const ownerBlocks = activeBlocks.filter((block) => block.block_type === "OWNER_BLOCK");
  const genericToken = workspace.exportTokens.find((token) => token.exclude_connection_id === null) ?? null;

  return (
    <DashboardShell active="Calendar" title="Calendar" eyebrow="Availability operations">
      {message ? <div className={`${styles.notice} ${isError ? styles.noticeError : ""}`}>{message}</div> : null}

      <div className="dash-toolbar">
        <div>
          <p>Canonical availability for owner blocks, connected channel calendars and future Find A Place reservations.</p>
          <small className="muted">Dates use checkout-exclusive ranges: a block ending October 10 does not block the night of October 10.</small>
        </div>
        <form className={styles.selector} method="get">
          <label>
            <span>Property / unit</span>
            <select name="unit" defaultValue={selected.unitId}>
              {workspace.targets.map((target) => <option value={target.unitId} key={target.unitId}>{targetLabel(target)}</option>)}
            </select>
          </label>
          <input type="hidden" name="month" value={workspace.month} />
          <button className="button button-small" type="submit">Open calendar</button>
        </form>
      </div>

      <div className={styles.summaryStrip}>
        <div><span>Connected sources</span><strong>{workspace.connections.length}</strong></div>
        <div><span>Blocked days this month</span><strong>{blockedCurrentDays}</strong></div>
        <div><span>Overlap warnings</span><strong>{conflictCurrentDays}</strong></div>
        <div><span>Listing state</span><strong>{selected.propertyStatus.replaceAll("_", " ")}</strong></div>
      </div>

      <div className={styles.workspaceGrid}>
        <section className={styles.calendarPanel}>
          <div className={styles.calendarTop}>
            <div><h2>{workspace.monthLabel}</h2><p>{targetLabel(selected)}</p></div>
            <div className={styles.monthNav}>
              <Link aria-label="Previous month" href={`/host/calendar?unit=${encodeURIComponent(selected.unitId)}&month=${workspace.previousMonth}`}>‹</Link>
              <Link aria-label="Next month" href={`/host/calendar?unit=${encodeURIComponent(selected.unitId)}&month=${workspace.nextMonth}`}>›</Link>
            </div>
          </div>
          <div className={styles.week}>{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className={styles.grid}>
            {workspace.days.map((day) => {
              const blocks = blocksByDate.get(day.date) ?? [];
              const pricing = pricingByDate.get(day.date);
              const price = calendarMoney(pricing?.nightly_cents, pricing?.currency || "USD");
              return (
                <div className={`${styles.day} ${day.inMonth ? "" : styles.outside} ${blocks.length > 1 ? styles.conflict : ""}`} key={day.date} title={blocks.length > 1 ? `${blocks.length} availability sources overlap on this date` : undefined}>
                  <div className={styles.dayHead}><b>{day.dayNumber}</b>{price ? <span className={styles.price}>{price}</span> : null}</div>
                  {pricing?.special_label ? <span className={styles.special}>{pricing.special_label}</span> : null}
                  {(pricing?.minimum_stay_nights ?? 1) > 1 ? <span className={styles.minStay}>min {pricing?.minimum_stay_nights} nights</span> : null}
                  <div className={styles.chips}>
                    {blocks.slice(0, 2).map((block) => <span className={blockClass(block)} key={block.id}>{blockLabel(block, connectionNames)}</span>)}
                    {blocks.length > 2 ? <span className={styles.more}>+{blocks.length - 2} more</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.legend}>
            <span><i className={styles.legendOwner}/>Owner block</span>
            <span><i className={styles.legendExternal}/>External calendar</span>
            <span><i className={styles.legendReservation}/>Find A Place reservation (future)</span>
            <span>Nightly price/minimum stay is read from the existing 9A pricing resolver.</span>
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.sidePanel}>
            <h2>Block dates</h2>
            <p>Use this for owner stays, maintenance or any date the unit should not be bookable.</p>
            <form action={createOwnerBlock} className={styles.formGrid}>
              <input type="hidden" name="unitId" value={selected.unitId} />
              <input type="hidden" name="month" value={workspace.month} />
              <div className={styles.two}>
                <label><span>Start / check-in</span><input type="date" name="start" required /></label>
                <label><span>End / checkout</span><input type="date" name="end" required /></label>
              </div>
              <label><span>Reason / label</span><input name="label" maxLength={180} placeholder="Owner stay, maintenance…" /></label>
              <button className="button button-small" type="submit">Block dates</button>
            </form>
            {ownerBlocks.length ? <div className={styles.ownerList}>{ownerBlocks.map((block) => (
              <div className={styles.ownerRow} key={block.id}>
                <div><strong>{block.label || "Owner block"}</strong><span>{displayDate(block.start_date)} → {displayDate(block.end_date)} checkout</span></div>
                <form action={cancelOwnerBlock}>
                  <input type="hidden" name="unitId" value={selected.unitId} /><input type="hidden" name="month" value={workspace.month} /><input type="hidden" name="blockId" value={block.id} />
                  <button className="button button-small button-quiet" type="submit">Remove</button>
                </form>
              </div>
            ))}</div> : null}
          </section>

          <section className={styles.sidePanel}>
            <h2>Connected calendars</h2>
            <p>Import an iCal/ICS feed from Airbnb, Vrbo, ResNexus or another channel. Each source stays tied to this unit and can only update its own imported blocks.</p>

            <div className={diagnosticStyles.availabilityOnly}>
              <strong>Availability only</strong>
              <span>iCal can block or reopen dates. It never imports nightly rates, cleaning fees, pet fees, taxes, discounts, policies or payout settings into Find A Place.</span>
            </div>

            <form action={connectIcalCalendar} className={styles.connectForm}>
              <input type="hidden" name="unitId" value={selected.unitId} />
              <input type="hidden" name="month" value={workspace.month} />
              <label><span>Provider</span><select name="provider" defaultValue="AIRBNB"><option value="AIRBNB">Airbnb</option><option value="VRBO">Vrbo</option><option value="BOOKING_COM">Booking.com</option><option value="LODGIFY">Lodgify</option><option value="OWNEREZ">OwnerRez</option><option value="RESNEXUS">ResNexus</option><option value="GOOGLE">Google Calendar</option><option value="OTHER_ICAL">Other iCal / ICS</option></select></label>
              <label><span>Connection label</span><input name="label" required maxLength={120} placeholder="Airbnb main calendar" /></label>
              <label><span>Private iCal feed URL</span><input type="text" inputMode="url" name="feedUrl" required placeholder="https://…/calendar.ics or webcal://…" autoComplete="off" /></label>
              <button className="button button-small" type="submit">Test, connect & sync</button>
            </form>
            <p className={styles.help}>Before a new source is saved, Find A Place performs a read-only compatibility test. Unsafe recurring/time-based events are rejected instead of guessing at blocked nights.</p>
            <p className={diagnosticStyles.resNexusTip}><strong>ResNexus:</strong> use the property&apos;s private iCal/ICS export URL. If a test reports recurring or timed events, the feed is reachable but is using calendar semantics Find A Place will not guess at.</p>

            <div className={styles.connections}>
              {workspace.connections.map((connection) => {
                const exportToken = workspace.exportTokens.find((token) => token.exclude_connection_id === connection.id) ?? null;
                const outboundUrl = exportToken ? calendarExportUrl(exportToken.token) : null;
                const statusClass = connection.sync_status === "ERROR" ? `${styles.status} ${styles.statusError}` : connection.sync_status === "NEVER_SYNCED" ? `${styles.status} ${styles.statusNever}` : styles.status;
                return (
                  <div className={styles.connection} key={connection.id}>
                    <div className={styles.connectionHead}><div><strong>{connection.label}</strong><small>{calendarProviderLabel(connection.provider)}{connection.sourceHost ? ` · ${connection.sourceHost}` : ""}</small></div><span className={statusClass}>{connection.sync_status.replaceAll("_", " ")}</span></div>
                    <div className={styles.connectionMeta}><span>{connection.activeBlockCount} active imported blocks</span><span>Last success: {displayTimestamp(connection.last_success_at)}</span></div>
                    {connection.last_error ? <div className={styles.connectionError}>{connection.last_error}</div> : null}
                    <div className={styles.actionRow}>
                      <form action={testIcalCalendar}><input type="hidden" name="unitId" value={selected.unitId} /><input type="hidden" name="month" value={workspace.month} /><input type="hidden" name="connectionId" value={connection.id} /><button className={`button button-small button-quiet ${diagnosticStyles.testButton}`} type="submit">Test connection</button></form>
                      <form action={syncIcalCalendar}><input type="hidden" name="unitId" value={selected.unitId} /><input type="hidden" name="month" value={workspace.month} /><input type="hidden" name="connectionId" value={connection.id} /><button className="button button-small button-quiet" type="submit">Sync now</button></form>
                      <form action={disconnectCalendar}><input type="hidden" name="unitId" value={selected.unitId} /><input type="hidden" name="month" value={workspace.month} /><input type="hidden" name="connectionId" value={connection.id} /><button className={`button button-small button-quiet ${styles.danger}`} type="submit">Disconnect</button></form>
                    </div>
                    {outboundUrl && exportToken ? <div className={styles.exportBox}><strong>Find A Place outbound feed for {calendarProviderLabel(connection.provider)}</strong><code className={styles.exportUrl}>{outboundUrl}</code><div className={styles.actionRow}><CalendarCopyButton value={outboundUrl} /><form action={rotateExportToken}><input type="hidden" name="unitId" value={selected.unitId} /><input type="hidden" name="month" value={workspace.month} /><input type="hidden" name="exportTokenId" value={exportToken.id} /><button className="button button-small button-quiet" type="submit">Rotate URL</button></form></div><p className={styles.help}>This source-specific export excludes events originally imported from this same connection, reducing calendar echo loops when you paste it back into that channel.</p></div> : null}
                  </div>
                );
              })}
              {!workspace.connections.length ? <p className="muted">No external calendars connected yet.</p> : null}
            </div>
          </section>

          <section className={styles.sidePanel}>
            <h2>General iCal export</h2>
            <p>Use a tokenized Find A Place feed when another system needs the unit&apos;s canonical unavailable dates and is not one of the source connections above.</p>
            {genericToken ? <>
              <code className={styles.exportUrl}>{calendarExportUrl(genericToken.token)}</code>
              <div className={styles.actionRow}><CalendarCopyButton value={calendarExportUrl(genericToken.token)} /><form action={rotateExportToken}><input type="hidden" name="unitId" value={selected.unitId} /><input type="hidden" name="month" value={workspace.month} /><input type="hidden" name="exportTokenId" value={genericToken.id} /><button className="button button-small button-quiet" type="submit">Rotate URL</button></form></div>
              <p className={styles.help}>The general feed includes owner blocks, future Find A Place reservations and imported blocks from all active sources. Prefer the source-specific feed above when round-tripping with an already connected channel.</p>
            </> : <form action={ensureGeneralExport}><input type="hidden" name="unitId" value={selected.unitId} /><input type="hidden" name="month" value={workspace.month} /><button className="button button-small" type="submit">Generate export URL</button></form>}
          </section>
        </aside>
      </div>
    </DashboardShell>
  );
}
