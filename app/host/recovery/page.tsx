import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties, type HostPropertySummary } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

import {
  declineRecoveryOpportunity,
  saveRecoverySettings,
  sendRecoveryOffer,
} from "./actions";
import styles from "./recovery.module.css";

type SettingRow = {
  property_id: string;
  is_enabled: boolean;
  day_one_enabled: boolean;
  offer_mode: "ASK" | "AUTO" | "OFF";
  default_discount_bps: number;
  minimum_interest: number;
  offer_expiry_hours: number;
};

type OpportunityRow = {
  id: string;
  property_id: string;
  check_in: string;
  check_out: string;
  interest_count: number;
  recoverable_count: number;
  suggested_discount_bps: number;
  status: string;
  opened_at: string;
  offered_at: string | null;
  expires_at: string | null;
};

function shortDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BookingRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; detail?: string }>;
}) {
  const [properties, params] = await Promise.all([
    getHostProperties(),
    searchParams,
  ]);
  const published = properties.filter((property) => property.status === "PUBLISHED");
  const propertyIds = published.map((property) => property.id);
  const supabase = await createClient();

  const [{ data: settingData }, { data: opportunityData }] = propertyIds.length
    ? await Promise.all([
        supabase
          .from("booking_recovery_settings")
          .select(
            "property_id,is_enabled,day_one_enabled,offer_mode,default_discount_bps,minimum_interest,offer_expiry_hours",
          )
          .in("property_id", propertyIds),
        supabase
          .from("booking_recovery_opportunities")
          .select(
            "id,property_id,check_in,check_out,interest_count,recoverable_count,suggested_discount_bps,status,opened_at,offered_at,expires_at",
          )
          .in("property_id", propertyIds)
          .in("status", ["OPEN", "SENT"])
          .order("opened_at", { ascending: false })
          .limit(100),
      ])
    : [{ data: [] }, { data: [] }];

  const settings = (settingData ?? []) as SettingRow[];
  const opportunities = (opportunityData ?? []) as OpportunityRow[];
  const settingByProperty = new Map(settings.map((row) => [row.property_id, row]));
  const propertyById = new Map<string, HostPropertySummary>(
    published.map((property) => [property.id, property]),
  );
  const open = opportunities.filter((row) => row.status === "OPEN");
  const sent = opportunities.filter((row) => row.status === "SENT").slice(0, 12);

  return (
    <DashboardShell active="Booking recovery" title="Booking recovery">
      <p className={styles.intro}>
        Recover guests who reached pricing or checkout but did not finish. The
        first reminder can go out after 24 hours only while those dates are
        still open. After 3 days, Find A Place can either ask you before sending
        a discount or automatically send your saved offer when enough travelers
        showed real booking interest.
      </p>

      {params.result ? (
        <div className={styles.message}>
          {params.result === "error"
            ? `Needs attention: ${params.detail || "Something went wrong."}`
            : params.detail ||
              (params.result === "settings-saved"
                ? "Booking recovery settings saved."
                : params.result === "declined"
                  ? "Recovery opportunity dismissed."
                  : "Recovery offer sent.")}
        </div>
      ) : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <p className="eyebrow dark">Waiting for you</p>
            <h2>Missed booking opportunities</h2>
            <p>
              These are exact date ranges that stayed open after multiple
              successful price checks. Only guests who actually gave Find A
              Place an email during checkout can receive an offer.
            </p>
          </div>
          <strong>{open.length} open</strong>
        </div>

        {open.length ? (
          <div className={styles.opportunityGrid}>
            {open.map((opportunity) => {
              const property = propertyById.get(opportunity.property_id);
              const defaultPercent = Math.max(
                1,
                Math.round(opportunity.suggested_discount_bps / 100),
              );
              return (
                <article className={styles.opportunity} key={opportunity.id}>
                  <div>
                    <strong>{property?.name || "Property"}</strong>
                    <div>
                      {shortDate(opportunity.check_in)} → {shortDate(opportunity.check_out)}
                    </div>
                    <div className={styles.metrics}>
                      <span>{opportunity.interest_count} successful price checks</span>
                      <span>{opportunity.recoverable_count} recoverable guest email{opportunity.recoverable_count === 1 ? "" : "s"}</span>
                    </div>
                  </div>

                  <div className={styles.offerForm}>
                    <form action={sendRecoveryOffer} className={styles.offerForm}>
                      <input type="hidden" name="opportunityId" value={opportunity.id} />
                      <label>
                        Discount %
                        <input
                          name="discountPercent"
                          type="number"
                          min="1"
                          max="50"
                          defaultValue={defaultPercent}
                        />
                      </label>
                      <button className="button button-small" type="submit">
                        Send offer emails
                      </button>
                    </form>
                    <form action={declineRecoveryOpportunity}>
                      <input type="hidden" name="opportunityId" value={opportunity.id} />
                      <button className="button button-small button-quiet" type="submit">
                        No thanks
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            No date ranges are waiting for a discount decision right now.
          </div>
        )}
      </section>

      <div className={styles.grid} style={{ marginTop: 16 }}>
        {published.length ? (
          published.map((property) => {
            const setting = settingByProperty.get(property.id);
            return (
              <section className={styles.card} key={property.id}>
                <div className={styles.cardHead}>
                  <div>
                    <h3>{property.name}</h3>
                    <p>
                      Recovery is {setting?.is_enabled ? "on" : "off"} for this property.
                    </p>
                  </div>
                </div>

                <form action={saveRecoverySettings} className={styles.settings}>
                  <input type="hidden" name="propertyId" value={property.id} />

                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={Boolean(setting?.is_enabled)}
                    />
                    <span>Enable missed-booking recovery</span>
                  </label>

                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      name="dayOneEnabled"
                      defaultChecked={setting ? setting.day_one_enabled : true}
                    />
                    <span>Send the 24-hour “dates are still available” email</span>
                  </label>

                  <label>
                    <span>After 3 days</span>
                    <select name="offerMode" defaultValue={setting?.offer_mode || "ASK"}>
                      <option value="ASK">Ask me before discounting</option>
                      <option value="AUTO">Automatically send my offer</option>
                      <option value="OFF">No discount follow-up</option>
                    </select>
                  </label>

                  <label>
                    <span>Default discount %</span>
                    <input
                      name="discountPercent"
                      type="number"
                      min="1"
                      max="50"
                      defaultValue={Math.round((setting?.default_discount_bps || 1000) / 100)}
                    />
                  </label>

                  <label>
                    <span>Interest needed</span>
                    <input
                      name="minimumInterest"
                      type="number"
                      min="1"
                      max="50"
                      defaultValue={setting?.minimum_interest || 2}
                    />
                  </label>

                  <label>
                    <span>Discount offer expires after</span>
                    <select
                      name="offerExpiryHours"
                      defaultValue={String(setting?.offer_expiry_hours || 48)}
                    >
                      <option value="24">24 hours</option>
                      <option value="48">48 hours</option>
                      <option value="72">72 hours</option>
                      <option value="120">5 days</option>
                      <option value="168">7 days</option>
                    </select>
                  </label>

                  <div className={styles.actions}>
                    <button className="button button-small" type="submit">
                      Save recovery settings
                    </button>
                  </div>
                </form>
              </section>
            );
          })
        ) : (
          <section className={styles.card}>
            <div className={styles.empty}>
              Publish a property before turning on missed-booking recovery.
            </div>
          </section>
        )}
      </div>

      {sent.length ? (
        <section className={styles.card} style={{ marginTop: 16 }}>
          <div className={styles.cardHead}>
            <div>
              <p className="eyebrow dark">Recent</p>
              <h2>Offers sent</h2>
            </div>
          </div>
          <div className={styles.opportunityGrid}>
            {sent.map((opportunity) => (
              <div className={styles.opportunity} key={opportunity.id}>
                <div>
                  <strong>{propertyById.get(opportunity.property_id)?.name || "Property"}</strong>
                  <div>
                    {shortDate(opportunity.check_in)} → {shortDate(opportunity.check_out)}
                  </div>
                </div>
                <span>
                  {Math.round(opportunity.suggested_discount_bps / 100)}% offer · {opportunity.recoverable_count} guest{opportunity.recoverable_count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
