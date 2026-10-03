import Link from "next/link";

import { CalendarCopyButton } from "@/components/CalendarCopyButton";
import { CalendarIntegrationPanel } from "@/components/CalendarIntegrationPanel";
import { CalendarUnitSelector } from "@/components/CalendarUnitSelector";
import { HostCalendarBoard } from "@/components/HostCalendarBoard";
import { DashboardShell } from "@/components/DashboardShell";
import { getThinkReservationsIntegrationState } from "@/lib/host/thinkreservations";
import {
  calendarExportUrl,
  calendarProviderLabel,
  getCalendarWorkspace,
} from "@/lib/host/calendar";
import {
  connectIcalCalendar,
  disconnectCalendar,
  ensureGeneralExport,
  rotateExportToken,
  syncIcalCalendar,
  testIcalCalendar,
} from "./actions";
import styles from "./calendar.module.css";
import diagnosticStyles from "./diagnostics.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function displayTimestamp(value: string | null) {
  if (!value) return "Never";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function targetLabel(target: {
  propertyName: string;
  unitName: string;
  isPrimary: boolean;
}) {
  if (
    target.isPrimary &&
    target.propertyName.trim().toLowerCase() ===
      target.unitName.trim().toLowerCase()
  ) {
    return target.propertyName;
  }

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
    "calendar-test-ok":
      "Calendar connection test passed. No availability was changed.",
    "calendar-test-error":
      "Calendar connection test found a compatibility problem. No availability was changed.",
    "calendar-disconnected": "Calendar disconnected.",
    "export-created": "Calendar export created.",
    "export-rotated": "Calendar export URL rotated.",
  };

  return messages[result] ?? "Calendar updated.";
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    unit?: string;
    month?: string;
    result?: string;
    detail?: string;
  }>;
}) {
  const params = await searchParams;

  const workspace = await getCalendarWorkspace({
    unitId: params.unit,
    month: params.month,
  });

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
          <p>
            Create the first property/unit before connecting external
            calendars or blocking dates.
          </p>
          <Link className="button" href="/host/properties">
            Go to properties
          </Link>
        </section>
      </DashboardShell>
    );
  }

  const selected = workspace.selected;
  const now = Date.now();

  const activeBlocks = workspace.blocks.filter(
    (block) =>
      block.block_type !== "INTERNAL_HOLD" ||
      !block.expires_at ||
      new Date(block.expires_at).getTime() > now,
  );

  const currentMonthDays = workspace.days.filter((day) => day.inMonth);

  const blockedCurrentDays = currentMonthDays.filter((day) =>
    activeBlocks.some(
      (block) =>
        block.start_date <= day.date && block.end_date > day.date,
    ),
  ).length;

  const conflictCurrentDays = currentMonthDays.filter(
    (day) =>
      activeBlocks.filter(
        (block) =>
          block.start_date <= day.date && block.end_date > day.date,
      ).length > 1,
  ).length;

  const genericToken =
    workspace.exportTokens.find(
      (token) => token.exclude_connection_id === null,
    ) ?? null;

  const icalConnections = workspace.connections.filter(
    (connection) => connection.connection_kind === "ICAL",
  );

  const thinkReservationsState =
    await getThinkReservationsIntegrationState(
      selected.organizationId,
      selected.unitId,
    );

  return (
    <DashboardShell
      active="Calendar"
      title="Calendar"
      eyebrow="Availability operations"
    >
      {message ? (
        <div
          className={`${styles.notice} ${
            isError ? styles.noticeError : ""
          }`}
        >
          {message}
        </div>
      ) : null}

      <div className="dash-toolbar">
        <div>
          <p>
            Canonical availability for owner blocks, connected channel
            calendars and Find A Place reservations.
          </p>
          <small className="muted">
            Click any calendar day to open it, inspect the source, or add a
            manual block.
          </small>
        </div>

        <CalendarUnitSelector
          key={selected.unitId}
          className={styles.selector}
          selectedUnitId={selected.unitId}
          month={workspace.month}
          targets={workspace.targets.map((target) => ({
            unitId: target.unitId,
            label: targetLabel(target),
          }))}
        />
      </div>

      <div className={styles.summaryStrip}>
        <div>
          <span>Connected sources</span>
          <strong>{workspace.connections.length}</strong>
        </div>
        <div>
          <span>Blocked days this month</span>
          <strong>{blockedCurrentDays}</strong>
        </div>
        <div>
          <span>Overlap warnings</span>
          <strong>{conflictCurrentDays}</strong>
        </div>
        <div>
          <span>Listing state</span>
          <strong>
            {selected.propertyStatus.replaceAll("_", " ")}
          </strong>
        </div>
      </div>

      <div className={styles.workspaceGrid}>
        <HostCalendarBoard
          key={`${selected.unitId}:${workspace.month}`}
          unitId={selected.unitId}
          month={workspace.month}
          monthLabel={workspace.monthLabel}
          unitLabel={targetLabel(selected)}
          previousMonthHref={`/host/calendar?unit=${encodeURIComponent(
            selected.unitId,
          )}&month=${workspace.previousMonth}`}
          nextMonthHref={`/host/calendar?unit=${encodeURIComponent(
            selected.unitId,
          )}&month=${workspace.nextMonth}`}
          days={workspace.days}
          blocks={activeBlocks}
          connections={workspace.connections}
          pricingDays={workspace.pricingDays}
        />

        <CalendarIntegrationPanel
          key={selected.unitId}
          organizationId={selected.organizationId}
          unitId={selected.unitId}
          unitLabel={targetLabel(selected)}
          month={workspace.month}
          state={thinkReservationsState}
        />

        <aside className={styles.side}>
          <section
            id="ical-connections"
            className={styles.sidePanel}
          >
            <h2>iCal / ICS calendar connections</h2>
            <p>
              Import an availability-only iCal/ICS feed from Airbnb, Vrbo,
              Guesty, Hostify or another channel. Each source stays tied to
              this unit and can only update its own imported blocks.
            </p>

            <div className={diagnosticStyles.availabilityOnly}>
              <strong>Availability only</strong>
              <span>
                iCal can block or reopen dates. It never imports nightly
                rates, cleaning fees, pet fees, taxes, discounts, policies
                or payout settings into Find A Place.
              </span>
            </div>

            <form
              action={connectIcalCalendar}
              className={styles.connectForm}
            >
              <input
                type="hidden"
                name="unitId"
                value={selected.unitId}
              />
              <input
                type="hidden"
                name="month"
                value={workspace.month}
              />

              <label>
                <span>Provider</span>
                <select name="provider" defaultValue="AIRBNB">
                  <option value="AIRBNB">Airbnb</option>
                  <option value="VRBO">Vrbo</option>
                  <option value="GUESTY">Guesty</option>
                  <option value="HOSTIFY">Hostify</option>
                  <option value="BOOKING_COM">Booking.com</option>
                  <option value="LODGIFY">Lodgify</option>
                  <option value="OWNEREZ">OwnerRez</option>
                  <option value="GOOGLE">Google Calendar</option>
                  <option value="OTHER_ICAL">Other iCal / ICS</option>
                </select>
              </label>

              <label>
                <span>Connection label</span>
                <input
                  name="label"
                  required
                  maxLength={120}
                  placeholder="Guesty main calendar"
                />
              </label>

              <label>
                <span>Private iCal feed URL</span>
                <input
                  type="text"
                  inputMode="url"
                  name="feedUrl"
                  required
                  placeholder="https://…/calendar.ics or webcal://…"
                  autoComplete="off"
                />
              </label>

              <button className="button button-small" type="submit">
                Test, connect & sync
              </button>
            </form>

            <p className={styles.help}>
              Before a new source is saved, Find A Place performs a
              read-only compatibility test. Unsafe recurring/time-based
              events are rejected instead of guessing at blocked nights.
            </p>

            <p className={styles.help}>
              <strong>Guesty:</strong> copy the listing&apos;s private iCal
              export URL from Guesty, choose Guesty above, and paste it
              here. This syncs unavailable dates only; the full Guesty
              channel/API integration is coming later.
            </p>

            <p className={styles.help}>
              <strong>Hostify:</strong> copy the listing&apos;s iCal export
              URL from Hostify, choose Hostify above, and paste it here.
              After connecting, use the source-specific Find A Place export
              URL shown on the connection if you also want Hostify to
              receive Find A Place blocked/booked dates.
            </p>

            <div className={styles.connections}>
              {icalConnections.map((connection) => {
                const exportToken =
                  workspace.exportTokens.find(
                    (token) =>
                      token.exclude_connection_id === connection.id,
                  ) ?? null;

                const outboundUrl = exportToken
                  ? calendarExportUrl(exportToken.token)
                  : null;

                const statusClass =
                  connection.sync_status === "ERROR"
                    ? `${styles.status} ${styles.statusError}`
                    : connection.sync_status === "NEVER_SYNCED"
                      ? `${styles.status} ${styles.statusNever}`
                      : styles.status;

                return (
                  <div
                    className={styles.connection}
                    key={connection.id}
                  >
                    <div className={styles.connectionHead}>
                      <div>
                        <strong>{connection.label}</strong>
                        <small>
                          {calendarProviderLabel(connection.provider)}
                          {connection.sourceHost
                            ? ` · ${connection.sourceHost}`
                            : ""}
                        </small>
                      </div>

                      <span className={statusClass}>
                        {connection.sync_status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className={styles.connectionMeta}>
                      <span>
                        {connection.activeBlockCount} active imported
                        blocks
                      </span>
                      <span>
                        Last success:{" "}
                        {displayTimestamp(connection.last_success_at)}
                      </span>
                    </div>

                    {connection.last_error ? (
                      <div className={styles.connectionError}>
                        {connection.last_error}
                      </div>
                    ) : null}

                    <div className={styles.actionRow}>
                      <form action={testIcalCalendar}>
                        <input
                          type="hidden"
                          name="unitId"
                          value={selected.unitId}
                        />
                        <input
                          type="hidden"
                          name="month"
                          value={workspace.month}
                        />
                        <input
                          type="hidden"
                          name="connectionId"
                          value={connection.id}
                        />
                        <button
                          className={`button button-small button-quiet ${diagnosticStyles.testButton}`}
                          type="submit"
                        >
                          Test connection
                        </button>
                      </form>

                      <form action={syncIcalCalendar}>
                        <input
                          type="hidden"
                          name="unitId"
                          value={selected.unitId}
                        />
                        <input
                          type="hidden"
                          name="month"
                          value={workspace.month}
                        />
                        <input
                          type="hidden"
                          name="connectionId"
                          value={connection.id}
                        />
                        <button
                          className="button button-small button-quiet"
                          type="submit"
                        >
                          Sync now
                        </button>
                      </form>

                      <form action={disconnectCalendar}>
                        <input
                          type="hidden"
                          name="unitId"
                          value={selected.unitId}
                        />
                        <input
                          type="hidden"
                          name="month"
                          value={workspace.month}
                        />
                        <input
                          type="hidden"
                          name="connectionId"
                          value={connection.id}
                        />
                        <button
                          className={`button button-small button-quiet ${styles.danger}`}
                          type="submit"
                        >
                          Disconnect
                        </button>
                      </form>
                    </div>

                    {outboundUrl && exportToken ? (
                      <div className={styles.exportBox}>
                        <strong>
                          Find A Place outbound feed for{" "}
                          {calendarProviderLabel(connection.provider)}
                        </strong>

                        <code className={styles.exportUrl}>
                          {outboundUrl}
                        </code>

                        <div className={styles.actionRow}>
                          <CalendarCopyButton value={outboundUrl} />

                          <form action={rotateExportToken}>
                            <input
                              type="hidden"
                              name="unitId"
                              value={selected.unitId}
                            />
                            <input
                              type="hidden"
                              name="month"
                              value={workspace.month}
                            />
                            <input
                              type="hidden"
                              name="exportTokenId"
                              value={exportToken.id}
                            />
                            <button
                              className="button button-small button-quiet"
                              type="submit"
                            >
                              Rotate URL
                            </button>
                          </form>
                        </div>

                        <p className={styles.help}>
                          This source-specific export excludes events
                          originally imported from this same connection,
                          reducing calendar echo loops when you paste it
                          back into that channel.
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {!icalConnections.length ? (
                <p className="muted">
                  No iCal calendars connected yet.
                </p>
              ) : null}
            </div>
          </section>

          <section className={styles.sidePanel}>
            <h2>General iCal export</h2>
            <p>
              Use a tokenized Find A Place feed when another system needs
              the unit&apos;s canonical unavailable dates and is not one of
              the source connections above.
            </p>

            {genericToken ? (
              <>
                <code className={styles.exportUrl}>
                  {calendarExportUrl(genericToken.token)}
                </code>

                <div className={styles.actionRow}>
                  <CalendarCopyButton
                    value={calendarExportUrl(genericToken.token)}
                  />

                  <form action={rotateExportToken}>
                    <input
                      type="hidden"
                      name="unitId"
                      value={selected.unitId}
                    />
                    <input
                      type="hidden"
                      name="month"
                      value={workspace.month}
                    />
                    <input
                      type="hidden"
                      name="exportTokenId"
                      value={genericToken.id}
                    />
                    <button
                      className="button button-small button-quiet"
                      type="submit"
                    >
                      Rotate URL
                    </button>
                  </form>
                </div>

                <p className={styles.help}>
                  The general feed includes owner blocks, Find A Place
                  reservations and imported blocks from all active sources.
                  Prefer the source-specific feed above when round-tripping
                  with an already connected channel.
                </p>
              </>
            ) : (
              <form action={ensureGeneralExport}>
                <input
                  type="hidden"
                  name="unitId"
                  value={selected.unitId}
                />
                <input
                  type="hidden"
                  name="month"
                  value={workspace.month}
                />
                <button className="button button-small" type="submit">
                  Generate export URL
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </DashboardShell>
  );
}
