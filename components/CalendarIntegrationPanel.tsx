import {
  connectThinkReservations,
  disconnectThinkReservationsUnit,
  mapThinkReservationsRoom,
  refreshThinkReservationsConnection,
  syncThinkReservationsNow,
} from "@/app/host/calendar/thinkreservations-actions";
import type { ThinkReservationsIntegrationState } from "@/lib/host/thinkreservations";

import styles from "./CalendarIntegrationPanel.module.css";

type Props = {
  organizationId: string;
  unitId: string;
  unitLabel: string;
  month: string;
  state: ThinkReservationsIntegrationState;
};

function stamp(value: string | null) {
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

export function CalendarIntegrationPanel({
  organizationId,
  unitId,
  unitLabel,
  month,
  state,
}: Props) {
  return (
    <section className={styles.panel} aria-labelledby="booking-system-integrations">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Booking system integrations</p>
          <h2 id="booking-system-integrations">Connect the system you already use</h2>
        </div>
        <p>
          Direct integrations feed booked and blocked dates into the same
          canonical calendar used by Find A Place checkout. Rates, fees, taxes,
          policies and payments stay owned by Find A Place.
        </p>
      </div>

      <div className={styles.grid}>
        <article className={`${styles.card} ${styles.primaryCard}`}>
          <div className={styles.cardHead}>
            <div>
              <strong>ThinkReservations</strong>
              <span>Direct PMS API · availability only</span>
            </div>
            <span className={`${styles.badge} ${state.integration ? styles.live : styles.next}`}>
              {state.integration ? "Connected" : "Available"}
            </span>
          </div>

          {!state.integration ? (
            <>
              <p>
                Connect a hotel-specific Restricted API Key. Find A Place only
                reads hotel/room data, reservations and availability blocks.
                It does not read or sync rates, fees, taxes or guest contact data.
              </p>

              <details className={styles.guide} open>
                <summary>Set up the Restricted API Key</summary>
                <ol>
                  <li>In ThinkReservations, open Settings → API Keys.</li>
                  <li>Create a Restricted API Key for Find A Place Booking.</li>
                  <li>
                    Enable only <code>read:hotel</code>, <code>read:room</code>,
                    <code>read:availability</code> and <code>read:reservation</code>.
                  </li>
                  <li>
                    Do not enable rate, customer or write permissions for this
                    calendar-only integration.
                  </li>
                  <li>Copy the Hotel ID shown with the key and the API key itself.</li>
                </ol>
              </details>

              <form action={connectThinkReservations} className={styles.connectForm}>
                <input type="hidden" name="organizationId" value={organizationId} />
                <input type="hidden" name="unitId" value={unitId} />
                <input type="hidden" name="month" value={month} />
                <label>
                  <span>ThinkReservations Hotel ID</span>
                  <input
                    name="hotelId"
                    required
                    maxLength={240}
                    autoComplete="off"
                    placeholder="Hotel ID from ThinkReservations API Keys"
                  />
                </label>
                <label>
                  <span>Restricted API Key</span>
                  <input
                    name="apiKey"
                    type="password"
                    required
                    maxLength={4096}
                    autoComplete="new-password"
                    placeholder="rk_live_…"
                  />
                </label>
                <button className="button button-small" type="submit">
                  Test & connect
                </button>
              </form>
            </>
          ) : (
            <>
              <div className={styles.connectedSummary}>
                <div>
                  <span>Hotel</span>
                  <strong>{state.integration.displayName || state.integration.hotelId}</strong>
                </div>
                <div>
                  <span>Connection</span>
                  <strong>{state.integration.status.replaceAll("_", " ")}</strong>
                </div>
                <div>
                  <span>Last verified</span>
                  <strong>{stamp(state.integration.lastVerifiedAt)}</strong>
                </div>
                <div>
                  <span>Last PMS sync</span>
                  <strong>{stamp(state.mapping?.lastSuccessAt ?? state.integration.lastSyncAt)}</strong>
                </div>
              </div>

              {state.integration.lastError ? (
                <div className={styles.errorBox}>{state.integration.lastError}</div>
              ) : null}

              <form action={mapThinkReservationsRoom} className={styles.mappingForm}>
                <input type="hidden" name="organizationId" value={organizationId} />
                <input type="hidden" name="integrationId" value={state.integration.id} />
                <input type="hidden" name="unitId" value={unitId} />
                <input type="hidden" name="month" value={month} />
                <label>
                  <span>Map {unitLabel} to a ThinkReservations room</span>
                  <select
                    name="roomId"
                    required
                    defaultValue={state.mapping?.externalRoomId ?? ""}
                  >
                    <option value="" disabled>
                      Select a ThinkReservations room
                    </option>
                    {state.rooms.map((room) => (
                      <option value={room.id} key={room.id}>
                        {room.name}
                        {room.roomTypeName ? ` · ${room.roomTypeName}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button button-small" type="submit">
                  {state.mapping ? "Update room mapping" : "Save mapping & start sync"}
                </button>
              </form>

              {!state.rooms.length ? (
                <p className={styles.warningText}>
                  No rooms are cached for this connection yet. Refresh the
                  connection, then map the Find A Place unit.
                </p>
              ) : null}

              <details className={styles.guide}>
                <summary>Replace or rotate the Restricted API Key</summary>
                <form action={connectThinkReservations} className={styles.connectForm}>
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="unitId" value={unitId} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="hotelId" value={state.integration.hotelId} />
                  <label>
                    <span>New Restricted API Key</span>
                    <input
                      name="apiKey"
                      type="password"
                      required
                      maxLength={4096}
                      autoComplete="new-password"
                      placeholder="rk_live_…"
                    />
                  </label>
                  <button className="button button-small button-quiet" type="submit">
                    Verify & replace key
                  </button>
                </form>
              </details>

              <div className={styles.actions}>
                <form action={refreshThinkReservationsConnection}>
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="integrationId" value={state.integration.id} />
                  <input type="hidden" name="unitId" value={unitId} />
                  <input type="hidden" name="month" value={month} />
                  <button className="button button-small button-quiet" type="submit">
                    Test connection
                  </button>
                </form>

                {state.mapping ? (
                  <>
                    <form action={syncThinkReservationsNow}>
                      <input type="hidden" name="connectionId" value={state.mapping.connectionId} />
                      <input type="hidden" name="unitId" value={unitId} />
                      <input type="hidden" name="month" value={month} />
                      <button className="button button-small button-quiet" type="submit">
                        Sync booked dates now
                      </button>
                    </form>
                    <form action={disconnectThinkReservationsUnit}>
                      <input type="hidden" name="connectionId" value={state.mapping.connectionId} />
                      <input type="hidden" name="unitId" value={unitId} />
                      <input type="hidden" name="month" value={month} />
                      <button className={`button button-small button-quiet ${styles.danger}`} type="submit">
                        Disconnect this unit
                      </button>
                    </form>
                  </>
                ) : null}
              </div>

              <p className={styles.note}>
                The Restricted API Key is encrypted server-side and is never
                displayed again. This connector never calls ThinkReservations
                rate or reservation-write endpoints.
              </p>
            </>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <strong>Guesty</strong>
              <span>iCal now · direct channel later</span>
            </div>
            <span className={`${styles.badge} ${styles.live}`}>iCal available</span>
          </div>
          <p>
            Guesty calendar feeds can sync unavailable dates now. A richer
            Guesty channel/API connection is planned after partner approval.
          </p>
          <details className={styles.guide}>
            <summary>Use Guesty iCal now</summary>
            <ol>
              <li>Open the listing calendar in Guesty and copy its iCal export link.</li>
              <li>Choose Guesty in the iCal provider list below.</li>
              <li>Paste the private feed URL and run the compatibility test.</li>
            </ol>
          </details>
          <div className={styles.actions}>
            <a className="button button-small button-quiet" href="#ical-connections">
              Connect Guesty iCal
            </a>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <strong>Hostify</strong>
              <span>Direct PMS API + webhooks</span>
            </div>
            <span className={`${styles.badge} ${styles.coming}`}>Coming soon</span>
          </div>
          <p>
            Planned direct integration for availability and reservation
            synchronization. No Hostify credentials are needed yet.
          </p>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <strong>Firefly Reservations</strong>
              <span>Channel integration</span>
            </div>
            <span className={`${styles.badge} ${styles.coming}`}>Coming soon</span>
          </div>
          <p>
            Planned through the Channex channel path, pending channel access,
            property mapping and production certification.
          </p>
        </article>
      </div>
    </section>
  );
}
