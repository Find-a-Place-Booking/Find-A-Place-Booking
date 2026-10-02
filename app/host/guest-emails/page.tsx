import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

import styles from "./guest-emails.module.css";

type RuleSummary = {
  property_id: string | null;
  trigger_event: "BEFORE_CHECKIN" | "AFTER_CHECKOUT";
  is_active: boolean;
  require_access_code: boolean;
  default_access_code: string | null;
  default_arrival_notes: string | null;
};

function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export default async function GuestEmailsPage() {
  const properties = await getHostProperties();
  const supabase = await createClient();
  const propertyIds = properties.map((property) => property.id);

  const { data: rulesData } = propertyIds.length
    ? await supabase
        .from("host_guest_email_rules")
        .select(
          "property_id,trigger_event,is_active,require_access_code,default_access_code,default_arrival_notes",
        )
        .in("property_id", propertyIds)
    : { data: [] as RuleSummary[] };

  const rules = (rulesData ?? []) as RuleSummary[];

  const rulesByProperty = new Map<string, RuleSummary[]>();
  for (const rule of rules) {
    if (!rule.property_id) continue;
    const current = rulesByProperty.get(rule.property_id) ?? [];
    current.push(rule);
    rulesByProperty.set(rule.property_id, current);
  }


  return (
    <DashboardShell active="Guest emails" title="Guest emails">
      <div className={styles.toolbar}>
        <div>
          <p className={styles.toolbarCopy}>
            Set up automated guest emails one property at a time. Guest names,
            stay dates, confirmation numbers and trip links fill automatically.
            Save each property's normal access code and arrival notes once and
            the pre-arrival email fills them automatically.
          </p>
        </div>
        <Link className="button button-small button-quiet" href="/host/properties">
          Properties
        </Link>
      </div>

      {properties.length ? (
        <div className={styles.propertyList}>
          {properties.map((property) => {
            const propertyRules = rulesByProperty.get(property.id) ?? [];
            const activeRules = propertyRules.filter((rule) => rule.is_active);
            const preArrivalRule = propertyRules.find(
              (rule) => rule.trigger_event === "BEFORE_CHECKIN",
            );
            const hasDefaultCode = Boolean(
              preArrivalRule?.default_access_code?.trim(),
            );
            const hasDefaultNotes = Boolean(
              preArrivalRule?.default_arrival_notes?.trim(),
            );

            return (
              <Link
                className={styles.propertyCard}
                href={`/host/guest-emails/${property.slug}`}
                key={property.id}
              >
                <div className={styles.propertyPhoto}>
                  {property.coverImageUrl ? (
                    <img src={property.coverImageUrl} alt="" />
                  ) : (
                    <span>No photo</span>
                  )}
                </div>

                <div className={styles.propertyCopy}>
                  <small className={styles.propertyStatus}>{statusLabel(property.status)}</small>
                  <h2>{property.name}</h2>
                  <p>
                    {property.publicArea ||
                      [property.city, property.state].filter(Boolean).join(", ") ||
                      "Location not set"}
                  </p>
                </div>

                <div className={styles.emailSummary}>
                  <small className={styles.summaryLabel}>Guest emails</small>
                  <strong>
                    {activeRules.length
                      ? `${activeRules.length} active`
                      : "Not set up"}
                  </strong>
                  <span className={styles.summaryText}>
                    {preArrivalRule
                      ? preArrivalRule.is_active
                        ? "Pre-arrival email on"
                        : "Pre-arrival email paused"
                      : "Ready-made template available"}
                  </span>
                </div>

                <div className={styles.metrics}>
                  <div className={styles.metric}>
                    <b>{hasDefaultCode ? "Saved" : "—"}</b>
                    <span>access code</span>
                  </div>
                  <div className={styles.metric}>
                    <b>{hasDefaultNotes ? "Saved" : "—"}</b>
                    <span>arrival notes</span>
                  </div>
                  <div className={styles.metric}>
                    <b>{propertyRules.length}</b>
                    <span>saved automations</span>
                  </div>
                </div>

                <strong className={styles.openLink}>Manage →</strong>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <div className="panel-empty panel-empty-large">
            <strong>Add a property before setting up guest emails.</strong>
            <span>
              Each property gets its own email templates, access code and
              arrival notes.
            </span>
            <Link className="button button-small" href="/host/properties/new">
              Add property
            </Link>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
