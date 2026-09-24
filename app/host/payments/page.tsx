import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import financeStyles from "@/components/HostFinancePanels.module.css";
import taxStyles from "@/components/HostTaxSettings.module.css";
import {
  PropertyTaxLineFields,
  type PropertyTaxLineInput,
} from "@/components/taxes/PropertyTaxLineFields";
import { EmbeddedStripeOnboarding } from "@/components/payments/EmbeddedStripeOnboarding";
import { getHostPaymentWorkspace } from "@/lib/host/payments";
import { getHostProperties } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";
import { getStateTaxSetup } from "@/lib/taxes/state-config";

import { saveHostPropertyTaxConfiguration } from "./actions";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
}

function readable(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function percent(bps: number) {
  return `${(Number(bps || 0) / 100).toFixed(bps % 100 ? 2 : 0)}%`;
}

function when(value: string | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

type TaxProfile = {
  property_id: string;
  county_name: string | null;
  locality_name: string | null;
  host_responsibility_ack: boolean;
  host_certified_at: string | null;
  certification_version: string | null;
  configuration_source: string | null;
  legacy_checkout_allowed: boolean;
};

type AutomaticRule = {
  id: string;
  authority_id: string;
  label: string;
  rate_bps: number;
};

type TaxAuthority = {
  id: string;
  country_code: string;
  region_code: string | null;
};

type PropertyTaxLineRow = PropertyTaxLineInput & {
  id: string;
  property_id: string;
  sort_order: number;
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [workspace, hostProperties, query] = await Promise.all([
    getHostPaymentWorkspace(),
    getHostProperties(),
    searchParams,
  ]);

  const readyAccount =
    workspace.accounts.find(
      (account) =>
        account.provider === "STRIPE" &&
        account.status === "READY" &&
        account.charges_enabled,
    ) ?? null;

  const stripe = workspace.readiness.find(
    (provider) => provider.provider === "STRIPE",
  )!;

  const stripeAccount =
    workspace.accounts.find(
      (account) => account.provider === "STRIPE",
    ) ?? null;

  const organization = workspace.organizations[0] ?? null;
  const supabase = await createClient();
  const propertyIds = hostProperties.map((property) => property.id);

  const [
    commissionResult,
    taxProfilesResult,
    taxLinesResult,
    automaticRulesResult,
    authoritiesResult,
  ] = await Promise.all([
    organization
      ? supabase
          .from("organizations")
          .select("partner_status,commission_tier")
          .eq("id", organization.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    propertyIds.length
      ? supabase
          .from("property_tax_profiles")
          .select(
            "property_id,county_name,locality_name,host_responsibility_ack,host_certified_at,certification_version,configuration_source,legacy_checkout_allowed",
          )
          .in("property_id", propertyIds)
      : Promise.resolve({ data: [] }),
    propertyIds.length
      ? supabase
          .from("property_tax_lines")
          .select(
            "id,property_id,category,label,rate_bps,base_scope,sort_order",
          )
          .in("property_id", propertyIds)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from("tax_rules")
      .select("id,authority_id,label,rate_bps")
      .eq("is_active", true)
      .eq("automatic_region", true)
      .eq("assignment_required", false),
    supabase
      .from("tax_authorities")
      .select("id,country_code,region_code")
      .eq("is_active", true),
  ]);

  const commissionOrganization = commissionResult.data;
  const isPartner =
    commissionOrganization?.commission_tier === "PARTNER_5" &&
    commissionOrganization?.partner_status === "VERIFIED";
  const commissionRate = isPartner ? 5 : 7;

  const taxProfiles = (taxProfilesResult.data ?? []) as TaxProfile[];
  const profileByProperty = new Map(
    taxProfiles.map((profile) => [profile.property_id, profile]),
  );

  const taxLines = (taxLinesResult.data ?? []) as PropertyTaxLineRow[];
  const linesByProperty = new Map<string, PropertyTaxLineRow[]>();
  for (const line of taxLines) {
    const current = linesByProperty.get(line.property_id) ?? [];
    current.push(line);
    linesByProperty.set(line.property_id, current);
  }

  const automaticRules = (automaticRulesResult.data ?? []) as AutomaticRule[];
  const authorities = (authoritiesResult.data ?? []) as TaxAuthority[];
  const authorityById = new Map(
    authorities.map((authority) => [authority.id, authority]),
  );

  const propertiesByState = new Map<string, typeof hostProperties>();
  for (const property of hostProperties) {
    const stateCode = (property.state || "OTHER").toUpperCase();
    const current = propertiesByState.get(stateCode) ?? [];
    current.push(property);
    propertiesByState.set(stateCode, current);
  }

  const stateGroups = [...propertiesByState.entries()].sort(([a], [b]) =>
    getStateTaxSetup(a).name.localeCompare(getStateTaxSetup(b).name),
  );

  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

  return (
    <DashboardShell
      active="Payments & taxes"
      title="Payments & taxes"
      eyebrow="Host payment settings"
    >
      {query.saved ? (
        <div className="admin-message success">{query.saved}</div>
      ) : null}
      {query.error ? (
        <div className="admin-message error">{query.error}</div>
      ) : null}

      <div
        className={`payment-status ${
          readyAccount ? "" : "payment-status-pending"
        }`}
      >
        <div className="status-icon">$</div>
        <div>
          <p className="eyebrow dark">Connected payment account</p>
          <h2>
            {readyAccount
              ? "Stripe account ready"
              : stripeAccount
                ? "Stripe setup in progress"
                : "No payment account connected"}
          </h2>
          <p>
            {readyAccount
              ? "Guest payments are charged directly on this host Stripe account. Stripe handles processing, balance availability and bank deposits."
              : "Connect Stripe here so guest payments can be processed directly on your host account. Bank and identity details stay with Stripe."}
          </p>
        </div>
        <strong>{readyAccount ? "Ready" : "Not ready"}</strong>
      </div>

      <section
        className="payment-provider-options"
        aria-label="Payment provider"
      >
        <div className="payment-provider-card">
          <div>
            <small>{readyAccount ? "Payment processor" : "Recommended"}</small>
            <strong>
              {readyAccount
                ? "Stripe Connect · Connected"
                : "Stripe Connect"}
            </strong>
            <span>
              {stripe.configured
                ? readyAccount
                  ? "Ready for direct guest payments. Stripe handles processing and bank deposits."
                  : "Already use Stripe? Sign in and Stripe can reuse eligible verified business details. New to Stripe? Create and complete your account here."
                : "Stripe setup is temporarily unavailable. Contact Find A Place for help."}
            </span>
          </div>

          {organization && stripe.configured && publishableKey ? (
            <EmbeddedStripeOnboarding
              organizationId={organization.id}
              publishableKey={publishableKey}
              connectedAndReady={Boolean(readyAccount)}
            />
          ) : (
            <button className="button button-small" disabled>
              Connect Stripe
            </button>
          )}
        </div>
      </section>

      <section className={`panel ${taxStyles.taxSection}`} id="property-taxes">
        <div className={taxStyles.taxSectionHeader}>
          <div>
            <p className="eyebrow dark">Property taxes</p>
            <h2>Tax setup follows each property's location.</h2>
            <p>
              You only see tax setup for states where you have properties.
              Find A Place adds the configured guest taxes to checkout, but
              the tax money remains in your connected Stripe charge.
            </p>
          </div>
          <span className={taxStyles.responsibilityBadge}>
            Host responsibility
          </span>
        </div>

        {stateGroups.length ? (
          <div className={taxStyles.stateGroups}>
            {stateGroups.map(([stateCode, properties]) => {
              const config = getStateTaxSetup(stateCode);
              return (
                <section className={taxStyles.stateGroup} key={stateCode}>
                  <div className={taxStyles.stateHeader}>
                    <div>
                      <h3>{config.name}</h3>
                      <p>{config.intro}</p>
                    </div>
                    <span>
                      {properties.length}{" "}
                      {properties.length === 1 ? "property" : "properties"}
                    </span>
                  </div>

                  {config.reviewNote ? (
                    <div
                      className={`${taxStyles.stateNotice} ${taxStyles.reviewNotice}`}
                    >
                      {config.reviewNote}
                    </div>
                  ) : null}

                  <div className={taxStyles.propertyTaxList}>
                    {properties.map((property) => {
                      const profile = profileByProperty.get(property.id);
                      const hostCertified =
                        Boolean(profile?.host_responsibility_ack) &&
                        Boolean(profile?.host_certified_at);
                      const legacy =
                        !hostCertified &&
                        Boolean(profile?.legacy_checkout_allowed);

                      const propertyRules = automaticRules.filter((rule) => {
                        const authority = authorityById.get(rule.authority_id);
                        return (
                          (!authority?.country_code ||
                            authority.country_code === "US") &&
                          (!authority?.region_code ||
                            authority.region_code === stateCode)
                        );
                      });

                      return (
                        <details
                          className={taxStyles.propertyTaxCard}
                          key={property.id}
                          open={!hostCertified}
                        >
                          <summary>
                            <span>
                              <strong>{property.name}</strong>
                              <small>
                                {[property.city, property.state]
                                  .filter(Boolean)
                                  .join(", ") || "Property location"}
                              </small>
                            </span>
                            <span className={taxStyles.statusArea}>
                              <b
                                className={
                                  hostCertified
                                    ? taxStyles.configured
                                    : legacy
                                      ? taxStyles.legacy
                                      : taxStyles.needsSetup
                                }
                              >
                                {hostCertified
                                  ? "Configured"
                                  : legacy
                                    ? "Confirm setup"
                                    : "Needs setup"}
                              </b>
                              <span>⌄</span>
                            </span>
                          </summary>

                          <div className={taxStyles.propertyTaxBody}>
                            <div className={taxStyles.automaticTaxes}>
                              <span>Automatically included</span>
                              <div>
                                {propertyRules.length ? (
                                  propertyRules.map((rule) => (
                                    <strong key={rule.id}>
                                      {rule.label} · {percent(rule.rate_bps)}
                                    </strong>
                                  ))
                                ) : (
                                  <strong>
                                    No automatic statewide rule is configured.
                                  </strong>
                                )}
                              </div>
                            </div>

                            {legacy ? (
                              <div className={taxStyles.legacyNotice}>
                                This property has an older tax setup. Review the
                                migrated local tax lines below and certify them
                                so responsibility is recorded to the host.
                              </div>
                            ) : null}

                            <form
                              className={taxStyles.taxForm}
                              action={saveHostPropertyTaxConfiguration}
                            >
                              <input
                                type="hidden"
                                name="propertyId"
                                value={property.id}
                              />

                              <div className={taxStyles.twoColumns}>
                                <label>
                                  <span>County</span>
                                  <input
                                    name="countyName"
                                    defaultValue={
                                      profile?.county_name ?? ""
                                    }
                                    placeholder="County"
                                  />
                                </label>
                                <label>
                                  <span>Tax locality / city</span>
                                  <input
                                    name="localityName"
                                    defaultValue={
                                      profile?.locality_name ??
                                      property.city ??
                                      ""
                                    }
                                    placeholder={property.city || "City"}
                                  />
                                </label>
                              </div>

                              <PropertyTaxLineFields
                                stateCode={stateCode}
                                initialLines={
                                  (linesByProperty.get(property.id) ??
                                    []) as PropertyTaxLineInput[]
                                }
                              />

                              <label className={taxStyles.certification}>
                                <input
                                  type="checkbox"
                                  name="responsibilityAck"
                                  required
                                />
                                <span>
                                  I confirm that this tax setup is accurate for
                                  this property. I understand that guest tax
                                  funds remain in my connected payment account
                                  and that I am responsible for the applicable
                                  filing and remittance obligations.
                                </span>
                              </label>

                              <div className={taxStyles.formFooter}>
                                <div>
                                  {hostCertified ? (
                                    <small>
                                      Last certified{" "}
                                      {when(profile?.host_certified_at)}
                                    </small>
                                  ) : (
                                    <small>
                                      Certification is required before a new
                                      property can use live checkout.
                                    </small>
                                  )}
                                </div>
                                <button
                                  className="button button-small"
                                  type="submit"
                                >
                                  Save &amp; certify
                                </button>
                              </div>
                            </form>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No properties yet.</strong>
            <span>Add a property before configuring guest taxes.</span>
          </div>
        )}

        <p className={taxStyles.supportNote}>
          Need help? Find A Place admins can enter or correct a property's tax
          setup, but the host still reviews and certifies the final
          configuration.
        </p>
      </section>

      <div className="dash-grid metrics">
        <div>
          <span>Payment accounts</span>
          <strong>{workspace.accounts.length}</strong>
          <small>Active connected accounts</small>
        </div>
        <div>
          <span>Stripe processing</span>
          <strong>Host pays</strong>
          <small>Stripe charges the connected host account</small>
        </div>
        <div>
          <span>Find A Place fee</span>
          <strong>{commissionRate}%</strong>
          <small>
            {isPartner
              ? "Partner rate · lodging subtotal only"
              : "Standard commission · lodging subtotal only"}
          </small>
        </div>
        <div>
          <span>Guest taxes</span>
          <strong>Host funds</strong>
          <small>Tax remains in the host's connected charge</small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Transactions</p>
            <h2>Booking payments</h2>
          </div>
          <span className="status-pill status-muted">
            {workspace.transactions.length} shown
          </span>
        </div>

        {workspace.transactions.length ? (
          <div className="admin-list compact">
            {workspace.transactions.map((transaction) => (
              <Link
                className="admin-list-row"
                href={`/host/reservations/${transaction.reservationId}`}
                key={transaction.paymentId}
              >
                <span>
                  <strong>
                    {transaction.confirmationCode} ·{" "}
                    {transaction.propertyName}
                  </strong>
                  <small>
                    {transaction.guestName || "Guest"} ·{" "}
                    {transaction.checkIn} → {transaction.checkOut}
                  </small>
                  <small>
                    Guest paid{" "}
                    {money(transaction.amountCents, transaction.currency)}
                    {" · "}Find A Place{" "}
                    {money(
                      transaction.commissionCents,
                      transaction.currency,
                    )}
                    {" · "}Guest tax{" "}
                    {money(transaction.taxCents, transaction.currency)} stays
                    with host
                  </small>
                  <small>
                    Stripe processing{" "}
                    {money(
                      transaction.processorFeeActualCents,
                      transaction.currency,
                    )}
                  </small>
                </span>
                <span>
                  <em>
                    Host net{" "}
                    {money(
                      transaction.hostProceedsCents,
                      transaction.currency,
                    )}
                  </em>
                  <small>{readable(transaction.status)}</small>
                  <b>View breakdown →</b>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No booking transactions yet.</strong>
            <span>
              Completed and in-progress Stripe booking payments will appear
              here.
            </span>
          </div>
        )}
      </section>

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Connected account</p>
          <h2>Your payment processor</h2>
          {workspace.accounts.length ? (
            <div className="admin-list compact">
              {workspace.accounts.map((account) => (
                <div className="admin-list-row static" key={account.id}>
                  <span>
                    <strong>
                      {readable(account.provider)} ·{" "}
                      {readable(account.status)}
                    </strong>
                    <small>
                      {account.currency}
                      {account.is_default
                        ? " · Default payment account"
                        : ""}
                    </small>
                  </span>
                  <span>
                    <em>
                      {account.charges_enabled
                        ? "Direct charges enabled"
                        : "Payment setup pending"}
                    </em>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <strong>No Stripe payment account connected yet.</strong>
              <span>
                Use Connect Stripe above to complete payment setup.
              </span>
            </div>
          )}
        </section>

        <section className={`panel ${financeStyles.moneyFlowPanel}`}>
          <p className="eyebrow dark">How money moves</p>
          <h2>Your booking money stays with your processor.</h2>

          <div className="tax-rule">
            <span>Guest charge</span>
            <strong>Created on your Stripe account</strong>
          </div>
          <div className="tax-rule">
            <span>Guest taxes</span>
            <strong>Remain in your Stripe charge proceeds</strong>
          </div>
          <div className="tax-rule">
            <span>Tax filing</span>
            <strong>Host handles applicable filing and remittance</strong>
          </div>
          <div className="tax-rule">
            <span>Stripe processing</span>
            <strong>Charged to your Stripe account</strong>
          </div>
          <div className="tax-rule">
            <span>Find A Place</span>
            <strong>
              Receives {commissionRate}% of the lodging subtotal
            </strong>
          </div>
          <div className="tax-rule">
            <span>Bank deposit</span>
            <strong>
              Handled by Stripe under your bank-deposit settings
            </strong>
          </div>

          <p className="muted">
            Find A Place does not hold your booking proceeds or guest tax
            funds. Stripe controls settlement, balance availability and bank
            deposits.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
