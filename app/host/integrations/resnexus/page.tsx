import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties } from "@/lib/host/properties";
import { getResNexusBrowserStates } from "@/lib/host/resnexus-browser";

import {
  disableResNexusBrowserConnection,
  retryResNexusBrowserConnection,
  saveResNexusBrowserConnection,
  submitResNexusVerificationCode,
} from "./actions";

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

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function ResNexusIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [properties, params] = await Promise.all([
    getHostProperties(),
    searchParams,
  ]);

  const states = await getResNexusBrowserStates(
    properties.map((property) => property.unitId),
  );
  const stateByUnit = new Map(states.map((state) => [state.unitId, state]));

  return (
    <DashboardShell
      active="Integrations"
      title="Integrations"
      eyebrow="Temporary ResNexus browser connector"
    >
      {params.saved ? (
        <div className="admin-message success">
          ResNexus connection settings saved. The browser worker will pick it up
          automatically.
        </div>
      ) : null}
      {params.error ? (
        <div className="admin-message error">{params.error}</div>
      ) : null}

      <section className="panel">
        <p className="eyebrow dark">ResNexus</p>
        <h2>Persistent browser availability sync</h2>
        <p>
          Until the official ResNexus API/channel connection is available, Find
          A Place can use a separate persistent browser worker to sign into the
          host&apos;s own ResNexus account and read booked/blocked availability.
        </p>

        <div className="admin-message neutral">
          <strong>Availability only.</strong> The worker does not create
          ResNexus reservations, change rates, collect guest card data, alter
          taxes or touch payments. If ResNexus asks for CAPTCHA, email
          verification or another security step, the connection stops and asks
          the host for attention instead of trying to bypass it.
        </div>
      </section>

      <div className="review-groups">
        {properties.map((property) => {
          const state = stateByUnit.get(property.unitId);

          return (
            <div key={property.unitId}>
              <div className="panel-head">
                <div>
                  <p className="eyebrow dark">{property.name}</p>
                  <strong>{state?.label || "ResNexus browser sync"}</strong>
                </div>
                <span
                  className={`status-pill ${
                    state?.status === "CONNECTED" ? "" : "status-muted"
                  }`}
                >
                  {state ? statusLabel(state.status) : "Not connected"}
                </span>
              </div>

              {state ? (
                <>
                  <div className="setting-row">
                    <span>Calendar status</span>
                    <strong>{statusLabel(state.calendarSyncStatus)}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Imported unavailable blocks</span>
                    <strong>{state.activeBlockCount}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Last browser check</span>
                    <strong>{stamp(state.lastAttemptAt)}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Last successful availability sync</span>
                    <strong>{stamp(state.lastSuccessAt)}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Next scheduled check</span>
                    <strong>{stamp(state.nextSyncAt)}</strong>
                  </div>

                  {state.resourceMatch ? (
                    <div className="setting-row">
                      <span>ResNexus room / unit match</span>
                      <strong>{state.resourceMatch}</strong>
                    </div>
                  ) : null}

                  {state.discoveredResources.length ? (
                    <div className="admin-message neutral">
                      Worker-discovered ResNexus resources:{" "}
                      {state.discoveredResources.join(", ")}
                    </div>
                  ) : null}

                  {state.attentionMessage ? (
                    <div className="admin-message error">
                      <strong>
                        {state.attentionCode || "Needs attention"}
                      </strong>
                      <br />
                      {state.attentionMessage}
                    </div>
                  ) : state.lastError ? (
                    <div className="admin-message error">
                      {state.lastError}
                    </div>
                  ) : null}

                  {state.status === "NEEDS_ATTENTION" &&
                  /VERIFICATION|MFA|CODE/i.test(
                    state.attentionCode || "",
                  ) ? (
                    <form
                      className="settings-form"
                      action={submitResNexusVerificationCode}
                    >
                      <input
                        type="hidden"
                        name="browser_connection_id"
                        value={state.id}
                      />
                      <label>
                        <span>One-time ResNexus verification code</span>
                        <input
                          name="verification_code"
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          maxLength={120}
                          required
                        />
                      </label>
                      <button
                        className="button button-small"
                        type="submit"
                      >
                        Submit code & retry
                      </button>
                    </form>
                  ) : null}

                  <details style={{ marginTop: 16 }}>
                    <summary>
                      Replace login, password or room mapping
                    </summary>
                    <form
                      className="settings-form"
                      action={saveResNexusBrowserConnection}
                      style={{ marginTop: 12 }}
                    >
                      <input
                        type="hidden"
                        name="unit_id"
                        value={property.unitId}
                      />
                      <label>
                        <span>Connection label</span>
                        <input
                          name="label"
                          defaultValue={state.label}
                          maxLength={120}
                          required
                        />
                      </label>
                      <label>
                        <span>ResNexus email / login</span>
                        <input
                          name="login"
                          type="text"
                          autoComplete="username"
                          maxLength={320}
                          required
                        />
                      </label>
                      <label>
                        <span>ResNexus password</span>
                        <input
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          maxLength={4096}
                          required
                        />
                      </label>
                      <label>
                        <span>ResNexus room / unit name</span>
                        <input
                          name="resource_match"
                          maxLength={240}
                          defaultValue={state.resourceMatch || ""}
                          placeholder="Exact room/cabin name shown in ResNexus"
                        />
                      </label>
                      <label>
                        <span>Check every</span>
                        <select
                          name="sync_interval_minutes"
                          defaultValue={String(state.syncIntervalMinutes)}
                        >
                          <option value="30">30 minutes</option>
                          <option value="60">60 minutes</option>
                          <option value="120">2 hours</option>
                        </select>
                      </label>
                      <button
                        className="button button-small"
                        type="submit"
                      >
                        Replace credentials & reconnect
                      </button>
                    </form>
                  </details>

                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      marginTop: 14,
                    }}
                  >
                    <form action={retryResNexusBrowserConnection}>
                      <input
                        type="hidden"
                        name="browser_connection_id"
                        value={state.id}
                      />
                      <button
                        className="button button-small button-quiet"
                        type="submit"
                      >
                        Retry now
                      </button>
                    </form>

                    <form action={disableResNexusBrowserConnection}>
                      <input
                        type="hidden"
                        name="browser_connection_id"
                        value={state.id}
                      />
                      <button
                        className="text-danger-button"
                        type="submit"
                      >
                        Disconnect ResNexus
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <form
                  className="settings-form"
                  action={saveResNexusBrowserConnection}
                >
                  <input
                    type="hidden"
                    name="unit_id"
                    value={property.unitId}
                  />

                  <label>
                    <span>Connection label</span>
                    <input
                      name="label"
                      defaultValue={`${property.name} · ResNexus`}
                      maxLength={120}
                      required
                    />
                  </label>

                  <label>
                    <span>ResNexus email / login</span>
                    <input
                      name="login"
                      type="text"
                      autoComplete="username"
                      maxLength={320}
                      required
                    />
                  </label>

                  <label>
                    <span>ResNexus password</span>
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      maxLength={4096}
                      required
                    />
                  </label>

                  <label>
                    <span>ResNexus room / unit name</span>
                    <input
                      name="resource_match"
                      maxLength={240}
                      placeholder="Exact cabin/room name shown in ResNexus"
                    />
                    <small className="settings-helper">
                      If the account only has one rentable resource, the worker
                      can discover it. If there are several, entering the exact
                      ResNexus name prevents a wrong-room match.
                    </small>
                  </label>

                  <label>
                    <span>Check every</span>
                    <select
                      name="sync_interval_minutes"
                      defaultValue="60"
                    >
                      <option value="30">30 minutes</option>
                      <option value="60">60 minutes</option>
                      <option value="120">2 hours</option>
                    </select>
                  </label>

                  <button
                    className="button button-small"
                    type="submit"
                  >
                    Encrypt credentials & connect
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {!properties.length ? (
        <section className="panel">
          <p>
            Create a property first, then return here to connect ResNexus.
          </p>
        </section>
      ) : null}
    </DashboardShell>
  );
}
