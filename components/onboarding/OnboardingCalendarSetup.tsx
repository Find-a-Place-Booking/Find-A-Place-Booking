"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./OnboardingCalendarSetup.module.css";

type Connection = {
  id: string;
  provider: string;
  connectionKind: "ICAL" | "PMS_API" | "BROWSER_WORKER";
  label: string;
  syncStatus: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  activeBlockCount: number;
  sourceHost: string | null;
};

type ThinkState = {
  integration: null | {
    id: string;
    hotelId: string;
    displayName: string | null;
    status: string;
    lastVerifiedAt: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
  };
  mapping: null | {
    connectionId: string;
    externalRoomId: string;
    externalRoomTypeId: string | null;
    syncStatus: string;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
  rooms: Array<{
    id: string;
    name: string;
    roomTypeId: string | null;
    roomTypeName: string | null;
  }>;
};

type ResNexusAccount = {
  id: string;
  label: string;
  status: string;
  discoveredResources: Array<{ key: string; label: string }>;
  attentionCode: string | null;
  attentionMessage: string | null;
  syncIntervalMinutes: number;
  nextSyncAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  mapping: null | {
    id: string;
    calendarConnectionId: string;
    resourceKey: string;
    resourceLabel: string;
    status: string;
    lastSuccessAt: string | null;
    lastError: string | null;
    calendarSyncStatus: string;
    activeBlockCount: number;
  };
};

type CalendarState = {
  target: { propertyId: string; unitId: string; slug: string };
  connections: Connection[];
  think: ThinkState;
  resNexus: ResNexusAccount[];
};

type Status = { configured: boolean; ready: boolean };

type Props = {
  organizationId: string;
  preference: string;
  initialConfigured: boolean;
  initialReady: boolean;
  onStatusChange: (status: Status) => void;
};

function providerLabel(value: string) {
  const labels: Record<string, string> = {
    AIRBNB: "Airbnb",
    VRBO: "Vrbo",
    BOOKING_COM: "Booking.com",
    GOOGLE: "Google Calendar",
    LODGIFY: "Lodgify",
    OWNEREZ: "OwnerRez",
    GUESTY: "Guesty",
    HOSTIFY: "Hostify",
    OTHER_ICAL: "Other iCal",
    THINKRESERVATIONS: "ThinkReservations",
    RESNEXUS: "ResNexus",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function stamp(value: string | null) {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizedPreference(value: string) {
  return value.trim().toUpperCase();
}

export function OnboardingCalendarSetup({
  organizationId,
  preference,
  initialConfigured,
  initialReady,
  onStatusChange,
}: Props) {
  const normalized = normalizedPreference(preference);
  const [state, setState] = useState<CalendarState | null>(null);
  const [loading, setLoading] = useState(
    normalized === "ICAL" || normalized === "PMS",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIcalForm, setShowIcalForm] = useState(!initialConfigured);

  const [icalProvider, setIcalProvider] = useState("AIRBNB");
  const [icalLabel, setIcalLabel] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [thinkHotelId, setThinkHotelId] = useState("");
  const [thinkApiKey, setThinkApiKey] = useState("");
  const [thinkRoomId, setThinkRoomId] = useState("");
  const [resNexusLogin, setResNexusLogin] = useState("");
  const [resNexusPassword, setResNexusPassword] = useState("");
  const [resNexusVerification, setResNexusVerification] = useState("");

  const icalConnections = useMemo(
    () => state?.connections.filter((connection) => connection.connectionKind === "ICAL") ?? [],
    [state],
  );

  const pmsConnections = useMemo(
    () =>
      state?.connections.filter((connection) =>
        ["PMS_API", "BROWSER_WORKER"].includes(connection.connectionKind),
      ) ?? [],
    [state],
  );

  const status = useMemo<Status>(() => {
    if (normalized === "NONE") return { configured: true, ready: true };
    if (normalized === "UNSET") return { configured: false, ready: false };

    const relevant = normalized === "ICAL" ? icalConnections : pmsConnections;
    if (!state) {
      return {
        configured: initialConfigured,
        ready: initialReady,
      };
    }

    return {
      configured: relevant.length > 0,
      ready: relevant.some(
        (connection) =>
          connection.syncStatus === "HEALTHY" && Boolean(connection.lastSuccessAt),
      ),
    };
  }, [normalized, state, icalConnections, pmsConnections, initialConfigured, initialReady]);

  useEffect(() => {
    onStatusChange(status);
  }, [status.configured, status.ready, onStatusChange]);

  async function call(
    action: string,
    payload: Record<string, unknown> = {},
    key = action,
    quiet = false,
  ) {
    setBusy(key);
    if (!quiet) {
      setError(null);
      setMessage(null);
    }

    try {
      const response = await fetch("/api/host/onboarding/calendar", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ organizationId, action, ...payload }),
      });
      const result = await response.json().catch(() => null);

      if (result?.state) setState(result.state as CalendarState);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || result?.message || "Calendar setup could not be updated.");
      }

      if (!quiet) setMessage(result.message || "Calendar setup updated.");
      return result as { ok: boolean; message?: string; state?: CalendarState };
    } catch (requestError) {
      if (!quiet) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Calendar setup could not be updated.",
        );
      }
      return null;
    } finally {
      setBusy(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (normalized !== "ICAL" && normalized !== "PMS") {
      setLoading(false);
      return;
    }
    setLoading(true);
    void call("state", {}, "state", true);
    // organizationId and the selected preference are the only values that
    // should cause a fresh server snapshot here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, normalized]);

  useEffect(() => {
    if (normalized !== "PMS" || !state?.resNexus.length) return;
    const waiting = state.resNexus.some(
      (account) =>
        ["PENDING", "REFRESHING"].includes(account.status) ||
        (!account.mapping && account.discoveredResources.length === 0),
    );
    if (!waiting) return;

    const timer = window.setInterval(() => {
      if (!busy) void call("state", {}, "poll", true);
    }, 6000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, state?.resNexus, busy]);

  useEffect(() => {
    if (icalConnections.length) setShowIcalForm(false);
  }, [icalConnections.length]);

  useEffect(() => {
    if (state?.think.mapping?.externalRoomId) {
      setThinkRoomId(state.think.mapping.externalRoomId);
    }
  }, [state?.think.mapping?.externalRoomId]);

  if (normalized === "UNSET") return null;

  if (normalized === "NONE") {
    return (
      <div className={`${styles.setup} ${styles.readyBox}`}>
        <strong>✓ Find A Place calendar selected</strong>
        <span>
          No external calendar is required. You can manage blocked dates and
          Find A Place reservations from the host Calendar after setup.
        </span>
      </div>
    );
  }

  return (
    <div className={styles.setup}>
      <div className={styles.statusBar}>
        <div>
          <strong>
            {status.ready
              ? "✓ Availability connected & synced"
              : status.configured
                ? "✓ Availability connected · first clean sync pending"
                : "Connect availability before continuing"}
          </strong>
          <span>
            {normalized === "ICAL"
              ? `${icalConnections.length} iCal source${icalConnections.length === 1 ? "" : "s"} connected to this property.`
              : `${pmsConnections.length} property-specific PMS mapping${pmsConnections.length === 1 ? "" : "s"} connected.`}
          </span>
        </div>
        {loading ? <b className={styles.badge}>Loading…</b> : null}
      </div>

      {message ? <div className={styles.success}>{message}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {normalized === "ICAL" ? (
        <>
          <div className={styles.multiNote}>
            <strong>Use Airbnb, Vrbo, or more than one booking site?</strong>
            <span>
              Add the private iCal feed for <b>each</b> site that controls this
              property. A date blocked by any connected calendar stays blocked
              on Find A Place, so the sources work together instead of replacing
              each other.
            </span>
          </div>

          {icalConnections.length ? (
            <div className={styles.sourceList}>
              {icalConnections.map((connection) => (
                <article className={styles.sourceCard} key={connection.id}>
                  <div className={styles.sourceHead}>
                    <div>
                      <strong>{connection.label || providerLabel(connection.provider)}</strong>
                      <span>
                        {providerLabel(connection.provider)}
                        {connection.sourceHost ? ` · ${connection.sourceHost}` : ""}
                      </span>
                    </div>
                    <b
                      className={`${styles.badge} ${
                        connection.syncStatus === "HEALTHY" ? styles.healthy : styles.pending
                      }`}
                    >
                      {connection.syncStatus.replaceAll("_", " ")}
                    </b>
                  </div>
                  <div className={styles.metaGrid}>
                    <span><b>{connection.activeBlockCount}</b> imported blocks</span>
                    <span>Last success: <b>{stamp(connection.lastSuccessAt)}</b></span>
                  </div>
                  {connection.lastError ? (
                    <div className={styles.inlineError}>{connection.lastError}</div>
                  ) : null}
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="button button-small button-quiet"
                      disabled={Boolean(busy)}
                      onClick={() => void call("test-ical", { connectionId: connection.id }, `test-${connection.id}`)}
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      className="button button-small button-quiet"
                      disabled={Boolean(busy)}
                      onClick={() => void call("sync-ical", { connectionId: connection.id }, `sync-${connection.id}`)}
                    >
                      Sync now
                    </button>
                    <button
                      type="button"
                      className={styles.removeButton}
                      disabled={Boolean(busy)}
                      onClick={() => void call("disconnect-ical", { connectionId: connection.id }, `remove-${connection.id}`)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {icalConnections.length && !showIcalForm ? (
            <button
              type="button"
              className={`button button-small button-quiet ${styles.addButton}`}
              onClick={() => setShowIcalForm(true)}
            >
              + Add another calendar
            </button>
          ) : null}

          {showIcalForm || !icalConnections.length ? (
            <form
              className={styles.formCard}
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  const result = await call(
                    "connect-ical",
                    { provider: icalProvider, label: icalLabel, feedUrl: icalUrl },
                    "connect-ical",
                  );
                  if (result) {
                    setIcalLabel("");
                    setIcalUrl("");
                    setShowIcalForm(false);
                  }
                })();
              }}
            >
              <div className={styles.formHead}>
                <div>
                  <strong>{icalConnections.length ? "Add another calendar" : "Connect the first calendar"}</strong>
                  <span>The private feed is stored server-side and is never displayed back in onboarding.</span>
                </div>
                {icalConnections.length ? (
                  <button type="button" className={styles.textButton} onClick={() => setShowIcalForm(false)}>
                    Cancel
                  </button>
                ) : null}
              </div>
              <div className={styles.fields}>
                <label>
                  <span>Booking site / provider</span>
                  <select value={icalProvider} onChange={(event) => setIcalProvider(event.target.value)}>
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
                  <span>Label (optional)</span>
                  <input
                    value={icalLabel}
                    onChange={(event) => setIcalLabel(event.target.value)}
                    maxLength={120}
                    placeholder={`${providerLabel(icalProvider)} calendar`}
                  />
                </label>
                <label className={styles.full}>
                  <span>Private iCal / ICS feed URL</span>
                  <input
                    value={icalUrl}
                    onChange={(event) => setIcalUrl(event.target.value)}
                    inputMode="url"
                    autoComplete="off"
                    required
                    placeholder="https://…/calendar.ics or webcal://…"
                  />
                </label>
              </div>
              <button className="button button-small" type="submit" disabled={Boolean(busy)}>
                {busy === "connect-ical" ? "Testing & syncing…" : "Test, connect & sync"}
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      {normalized === "PMS" ? (
        <div className={styles.pmsGrid}>
          <article className={styles.integrationCard}>
            <div className={styles.integrationHead}>
              <div>
                <strong>ThinkReservations</strong>
                <span>Direct availability API</span>
              </div>
              <b className={styles.badge}>{state?.think.integration ? "CONNECTED" : "SET UP"}</b>
            </div>

            {!state?.think.integration ? (
              <form
                className={styles.stackForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void (async () => {
                    const result = await call(
                      "connect-think",
                      { hotelId: thinkHotelId, apiKey: thinkApiKey },
                      "connect-think",
                    );
                    if (result) setThinkApiKey("");
                  })();
                }}
              >
                <p>
                  Connect the host&apos;s Restricted API Key once. Future cabins
                  under this host will reuse it and only ask which room belongs
                  to that property.
                </p>
                <label>
                  <span>ThinkReservations Hotel ID</span>
                  <input value={thinkHotelId} onChange={(event) => setThinkHotelId(event.target.value)} required />
                </label>
                <label>
                  <span>Restricted API Key</span>
                  <input
                    type="password"
                    value={thinkApiKey}
                    onChange={(event) => setThinkApiKey(event.target.value)}
                    autoComplete="new-password"
                    required
                    placeholder="rk_live_…"
                  />
                </label>
                <button className="button button-small" disabled={Boolean(busy)} type="submit">
                  {busy === "connect-think" ? "Testing…" : "Test & connect ThinkReservations"}
                </button>
              </form>
            ) : (
              <>
                <div className={styles.reuseNotice}>
                  <strong>✓ ThinkReservations is already connected for this host.</strong>
                  <span>
                    No API key re-entry needed. Just choose the ThinkReservations
                    room that matches this property.
                  </span>
                </div>
                <div className={styles.accountMeta}>
                  <span>Hotel <b>{state.think.integration.displayName || state.think.integration.hotelId}</b></span>
                  <span>Last verified <b>{stamp(state.think.integration.lastVerifiedAt)}</b></span>
                </div>
                {state.think.integration.lastError ? (
                  <div className={styles.inlineError}>{state.think.integration.lastError}</div>
                ) : null}
                <form
                  className={styles.stackForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void call(
                      "map-think",
                      {
                        integrationId: state.think.integration?.id,
                        roomId: thinkRoomId,
                      },
                      "map-think",
                    );
                  }}
                >
                  <label>
                    <span>Room for this Find A Place property</span>
                    <select value={thinkRoomId} onChange={(event) => setThinkRoomId(event.target.value)} required>
                      <option value="">Choose room</option>
                      {state.think.rooms.map((room) => (
                        <option value={room.id} key={room.id}>
                          {room.name}{room.roomTypeName ? ` · ${room.roomTypeName}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.actions}>
                    <button className="button button-small" disabled={Boolean(busy)} type="submit">
                      {state.think.mapping ? "Update room mapping" : "Map room & sync"}
                    </button>
                    <button
                      className="button button-small button-quiet"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void call("test-think", { integrationId: state.think.integration?.id }, "test-think")}
                    >
                      Test account
                    </button>
                    {state.think.mapping ? (
                      <button
                        className="button button-small button-quiet"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void call("sync-think", { connectionId: state.think.mapping?.connectionId }, "sync-think")}
                      >
                        Sync now
                      </button>
                    ) : null}
                  </div>
                </form>
                {state.think.mapping ? (
                  <div className={styles.mappingStatus}>
                    <strong>{state.think.mapping.syncStatus.replaceAll("_", " ")}</strong>
                    <span>Last success: {stamp(state.think.mapping.lastSuccessAt)}</span>
                    {state.think.mapping.lastError ? <span>{state.think.mapping.lastError}</span> : null}
                  </div>
                ) : null}
              </>
            )}
          </article>

          <article className={styles.integrationCard}>
            <div className={styles.integrationHead}>
              <div>
                <strong>ResNexus</strong>
                <span>Persistent browser availability sync</span>
              </div>
              <b className={styles.badge}>{state?.resNexus.length ? "CONNECTED" : "SET UP"}</b>
            </div>

            {!state?.resNexus.length ? (
              <form
                className={styles.stackForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void (async () => {
                    const result = await call(
                      "connect-resnexus",
                      { label: "ResNexus", login: resNexusLogin, password: resNexusPassword, syncIntervalMinutes: 60 },
                      "connect-resnexus",
                    );
                    if (result) setResNexusPassword("");
                  })();
                }}
              >
                <p>
                  Connect the ResNexus account once. The worker discovers its
                  cabins, then you map this Find A Place property below without
                  leaving onboarding.
                </p>
                <label>
                  <span>ResNexus login</span>
                  <input value={resNexusLogin} onChange={(event) => setResNexusLogin(event.target.value)} autoComplete="username" required />
                </label>
                <label>
                  <span>ResNexus password</span>
                  <input type="password" value={resNexusPassword} onChange={(event) => setResNexusPassword(event.target.value)} autoComplete="current-password" required />
                </label>
                <button className="button button-small" type="submit" disabled={Boolean(busy)}>
                  {busy === "connect-resnexus" ? "Connecting…" : "Connect ResNexus"}
                </button>
              </form>
            ) : (
              <div className={styles.accountList}>
                {state.resNexus.map((account) => (
                  <div className={styles.accountCard} key={account.id}>
                    <div className={styles.sourceHead}>
                      <div>
                        <strong>{account.label}</strong>
                        <span>{account.discoveredResources.length} discovered room/cabin{account.discoveredResources.length === 1 ? "" : "s"}</span>
                      </div>
                      <b className={styles.badge}>{account.status.replaceAll("_", " ")}</b>
                    </div>

                    {account.attentionMessage ? (
                      <div className={styles.inlineError}>
                        <strong>{account.attentionCode || "Needs attention"}</strong><br />
                        {account.attentionMessage}
                      </div>
                    ) : account.lastError ? (
                      <div className={styles.inlineError}>{account.lastError}</div>
                    ) : null}

                    {account.status === "NEEDS_ATTENTION" && /VERIFICATION|MFA|CODE/i.test(account.attentionCode || "") ? (
                      <form
                        className={styles.inlineForm}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void call(
                            "verify-resnexus",
                            { accountId: account.id, verificationCode: resNexusVerification },
                            `verify-${account.id}`,
                          );
                        }}
                      >
                        <input
                          value={resNexusVerification}
                          onChange={(event) => setResNexusVerification(event.target.value)}
                          autoComplete="one-time-code"
                          placeholder="Verification code"
                          required
                        />
                        <button className="button button-small" type="submit" disabled={Boolean(busy)}>
                          Submit code
                        </button>
                      </form>
                    ) : null}

                    {account.discoveredResources.length ? (
                      <form
                        className={styles.stackForm}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const formData = new FormData(event.currentTarget);
                          void call(
                            "map-resnexus",
                            { accountId: account.id, resourceKey: String(formData.get("resourceKey") || "") },
                            `map-${account.id}`,
                          );
                        }}
                      >
                        <label>
                          <span>ResNexus room/cabin for this property</span>
                          <select name="resourceKey" defaultValue={account.mapping?.resourceKey || ""} required>
                            <option value="">Choose room/cabin</option>
                            {account.discoveredResources.map((resource) => (
                              <option value={resource.key} key={resource.key}>{resource.label}</option>
                            ))}
                          </select>
                        </label>
                        <div className={styles.actions}>
                          <button className="button button-small" type="submit" disabled={Boolean(busy)}>
                            {account.mapping ? "Update mapping" : "Map this property"}
                          </button>
                          <button
                            className="button button-small button-quiet"
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => void call("retry-resnexus", { accountId: account.id }, `retry-${account.id}`)}
                          >
                            Retry / refresh
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className={styles.reuseNotice}>
                        <strong>Checking ResNexus for cabins…</strong>
                        <span>
                          Stay on this step. We&apos;ll refresh the discovered-room
                          list automatically; you do not need to leave onboarding.
                        </span>
                        <button
                          className="button button-small button-quiet"
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void call("retry-resnexus", { accountId: account.id }, `retry-${account.id}`)}
                        >
                          Retry now
                        </button>
                      </div>
                    )}

                    {account.mapping ? (
                      <div className={styles.mappingStatus}>
                        <strong>✓ {account.mapping.resourceLabel}</strong>
                        <span>
                          Calendar {account.mapping.calendarSyncStatus.replaceAll("_", " ")} · {account.mapping.activeBlockCount} imported blocks
                        </span>
                        <span>Last success: {stamp(account.mapping.lastSuccessAt)}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </article>

          <div className={styles.pmsHelp}>
            <strong>Using a different PMS?</strong>
            <span>
              If it gives you a standard private iCal/ICS export, choose
              <b> iCal / ICS</b> above and connect it here during onboarding.
              The full Calendar workspace is still available later for advanced
              exports, manual blocks and diagnostics.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
