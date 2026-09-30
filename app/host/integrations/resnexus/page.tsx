import { DashboardShell } from "@/components/DashboardShell";
import {
  getHostProperties,
  getManagedOrganizations,
} from "@/lib/host/properties";
import { getResNexusBrowserAccounts } from "@/lib/host/resnexus-browser";

import {
  disconnectResNexusBrowserAccount,
  retryResNexusBrowserAccount,
  saveResNexusBrowserAccount,
  saveResNexusResourceMappings,
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
  const [properties, organizations, accounts, params] = await Promise.all([
    getHostProperties(),
    getManagedOrganizations(),
    getResNexusBrowserAccounts(),
    searchParams,
  ]);

  const propertiesByOrganization = new Map<
    string,
    typeof properties
  >();

  for (const property of properties) {
    const list =
      propertiesByOrganization.get(property.organizationId) ?? [];
    list.push(property);
    propertiesByOrganization.set(property.organizationId, list);
  }

  const accountsByOrganization = new Map<
    string,
    typeof accounts
  >();

  for (const account of accounts) {
    const list =
      accountsByOrganization.get(account.organizationId) ?? [];
    list.push(account);
    accountsByOrganization.set(account.organizationId, list);
  }

  return (
    <DashboardShell
      active="Integrations"
      title="Integrations"
      eyebrow="ResNexus account calendar sync"
    >
      {params.saved ? (
        <div className="admin-message success">
          ResNexus settings saved. The persistent browser worker will pick up
          the change automatically.
        </div>
      ) : null}

      {params.error ? (
        <div className="admin-message error">{params.error}</div>
      ) : null}

      <section className="panel">
        <p className="eyebrow dark">ResNexus</p>
        <h2>Connect once, then map all of the cabins.</h2>
        <p>
          Each ResNexus account has one encrypted login and one persistent
          browser session. The worker reads the account calendar, discovers the
          rooms/cabins inside it, and lets you map each one to the matching Find
          A Place property.
        </p>

        <div className="admin-message neutral">
          <strong>Availability only.</strong> This connector does not create or
          edit ResNexus reservations, rates, taxes, fees or payments. CAPTCHA
          and human-verification screens are not bypassed.
        </div>
      </section>

      {organizations.map((organization) => {
        const organizationProperties =
          propertiesByOrganization.get(organization.id) ?? [];
        const organizationAccounts =
          accountsByOrganization.get(organization.id) ?? [];

        return (
          <section className="panel" key={organization.id}>
            <div className="panel-head">
              <div>
                <p className="eyebrow dark">Host account</p>
                <h2>{organization.name}</h2>
              </div>
            </div>

            {organizationAccounts.map((account) => {
              const mappingByUnit = new Map(
                account.mappings.map((mapping) => [
                  mapping.unitId,
                  mapping,
                ]),
              );

              return (
                <div
                  key={account.id}
                  style={{
                    borderTop: "1px solid rgba(0,0,0,.12)",
                    paddingTop: 20,
                    marginTop: 20,
                  }}
                >
                  <div className="panel-head">
                    <div>
                      <strong>{account.label}</strong>
                      <p className="muted">
                        One login · {account.mappings.length} mapped{" "}
                        {account.mappings.length === 1
                          ? "property"
                          : "properties"}
                      </p>
                    </div>
                    <span
                      className={`status-pill ${
                        account.status === "CONNECTED"
                          ? ""
                          : "status-muted"
                      }`}
                    >
                      {statusLabel(account.status)}
                    </span>
                  </div>

                  <div className="setting-row">
                    <span>Last browser check</span>
                    <strong>{stamp(account.lastAttemptAt)}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Last successful account scan</span>
                    <strong>{stamp(account.lastSuccessAt)}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Next scheduled check</span>
                    <strong>{stamp(account.nextSyncAt)}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Discovered ResNexus rooms / cabins</span>
                    <strong>{account.discoveredResources.length}</strong>
                  </div>

                  {account.attentionMessage ? (
                    <div className="admin-message error">
                      <strong>
                        {account.attentionCode || "Needs attention"}
                      </strong>
                      <br />
                      {account.attentionMessage}
                    </div>
                  ) : account.lastError ? (
                    <div className="admin-message error">
                      {account.lastError}
                    </div>
                  ) : null}

                  {account.status === "NEEDS_ATTENTION" &&
                  /VERIFICATION|MFA|CODE/i.test(
                    account.attentionCode || "",
                  ) ? (
                    <form
                      className="settings-form"
                      action={submitResNexusVerificationCode}
                    >
                      <input
                        type="hidden"
                        name="account_id"
                        value={account.id}
                      />
                      <label>
                        <span>One-time ResNexus verification code</span>
                        <input
                          name="verification_code"
                          autoComplete="one-time-code"
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

                  {account.discoveredResources.length ? (
                    <>
                      <h3 style={{ marginTop: 24 }}>
                        Map ResNexus cabins to Find A Place
                      </h3>
                      <p className="muted">
                        Each ResNexus room/cabin can map to one Find A Place
                        property. Leave a property as Not mapped if it is not
                        managed by this ResNexus account.
                      </p>

                      <form
                        className="settings-form"
                        action={saveResNexusResourceMappings}
                      >
                        <input
                          type="hidden"
                          name="account_id"
                          value={account.id}
                        />

                        {organizationProperties.map((property) => {
                          const mapping = mappingByUnit.get(
                            property.unitId,
                          );

                          return (
                            <label key={property.unitId}>
                              <span>{property.name}</span>
                              <select
                                name={`mapping:${property.unitId}`}
                                defaultValue={
                                  mapping?.resourceKey || ""
                                }
                              >
                                <option value="">Not mapped</option>
                                {account.discoveredResources.map(
                                  (resource) => (
                                    <option
                                      value={resource.key}
                                      key={resource.key}
                                    >
                                      {resource.label}
                                    </option>
                                  ),
                                )}
                              </select>
                              {mapping ? (
                                <small className="settings-helper">
                                  {statusLabel(mapping.status)} ·{" "}
                                  {mapping.activeBlockCount} active imported
                                  blocks · calendar{" "}
                                  {statusLabel(
                                    mapping.calendarSyncStatus,
                                  )}
                                  {mapping.lastError
                                    ? ` · ${mapping.lastError}`
                                    : ""}
                                </small>
                              ) : null}
                            </label>
                          );
                        })}

                        <button
                          className="button button-small"
                          type="submit"
                        >
                          Save property mappings
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="admin-message neutral">
                      The worker needs one successful account scan before the
                      cabin mapping dropdowns can appear. Click Retry now after
                      Railway is running.
                    </div>
                  )}

                  <details style={{ marginTop: 20 }}>
                    <summary>
                      Replace ResNexus login or change sync frequency
                    </summary>

                    <form
                      className="settings-form"
                      action={saveResNexusBrowserAccount}
                      style={{ marginTop: 12 }}
                    >
                      <input
                        type="hidden"
                        name="organization_id"
                        value={organization.id}
                      />
                      <input
                        type="hidden"
                        name="account_id"
                        value={account.id}
                      />

                      <label>
                        <span>Connection name</span>
                        <input
                          name="label"
                          defaultValue={account.label}
                          maxLength={120}
                          required
                        />
                      </label>

                      <label>
                        <span>ResNexus login</span>
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
                        <span>Check every</span>
                        <select
                          name="sync_interval_minutes"
                          defaultValue={String(
                            account.syncIntervalMinutes,
                          )}
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
                      marginTop: 16,
                    }}
                  >
                    <form action={retryResNexusBrowserAccount}>
                      <input
                        type="hidden"
                        name="account_id"
                        value={account.id}
                      />
                      <button
                        className="button button-small button-quiet"
                        type="submit"
                      >
                        Retry now
                      </button>
                    </form>

                    <form action={disconnectResNexusBrowserAccount}>
                      <input
                        type="hidden"
                        name="account_id"
                        value={account.id}
                      />
                      <button
                        className="text-danger-button"
                        type="submit"
                      >
                        Disconnect ResNexus
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}

            <details
              open={!organizationAccounts.length}
              style={{ marginTop: 20 }}
            >
              <summary>
                {organizationAccounts.length
                  ? "Connect another ResNexus account"
                  : "Connect ResNexus"}
              </summary>

              <form
                className="settings-form"
                action={saveResNexusBrowserAccount}
                style={{ marginTop: 12 }}
              >
                <input
                  type="hidden"
                  name="organization_id"
                  value={organization.id}
                />

                <label>
                  <span>Connection name</span>
                  <input
                    name="label"
                    defaultValue="ResNexus"
                    maxLength={120}
                    required
                  />
                </label>

                <label>
                  <span>ResNexus login</span>
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
                  Encrypt credentials & connect account
                </button>
              </form>
            </details>
          </section>
        );
      })}

      {!organizations.length ? (
        <section className="panel">
          <p>
            Create or join a host organization before connecting ResNexus.
          </p>
        </section>
      ) : null}
    </DashboardShell>
  );
}
