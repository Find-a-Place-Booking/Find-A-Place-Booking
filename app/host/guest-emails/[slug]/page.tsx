import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

import styles from "../guest-emails.module.css";

import {
  deleteGuestEmailRule,
  saveGuestEmailRule,
  toggleGuestEmailRule,
} from "../actions";

type RuleRow = {
  id: string;
  organization_id: string;
  property_id: string | null;
  name: string;
  trigger_event: "BEFORE_CHECKIN" | "AFTER_CHECKOUT";
  day_offset: number;
  send_time_local: string;
  subject_template: string;
  body_template: string;
  require_access_code: boolean;
  default_access_code: string | null;
  default_arrival_notes: string | null;
  is_active: boolean;
  created_at: string;
};

const defaultArrivalSubject = "Your stay at {{property_name}} is coming up";
const defaultArrivalBody = `Hi {{guest_name}},

Your stay at {{property_name}} is coming up.

Check-in: {{check_in}}
Check-out: {{check_out}}
Confirmation: {{confirmation_code}}

Access / door code: {{access_code}}

Arrival notes:
{{arrival_notes}}

You can review your reservation or message us here:
{{trip_url}}

— {{host_name}}`;

const defaultPostStaySubject = "Thanks for staying at {{property_name}}";
const defaultPostStayBody = `Hi {{guest_name}},

Thanks for staying at {{property_name}}. We hope you had a great trip.

Your stay: {{check_in}} → {{check_out}}
Confirmation: {{confirmation_code}}

If you need anything about your reservation, you can still reach us here:
{{trip_url}}

— {{host_name}}`;

function timeValue(value: string | null | undefined, fallback = "10:00") {
  return value ? String(value).slice(0, 5) : fallback;
}

function automationTiming(rule: RuleRow) {
  const days = `${rule.day_offset} day${rule.day_offset === 1 ? "" : "s"}`;
  return rule.trigger_event === "BEFORE_CHECKIN"
    ? `${days} before check-in`
    : `${days} after checkout`;
}

function AutomationEditor({
  propertyId,
  organizationId,
  returnTo,
  rule,
  kind,
}: {
  propertyId: string;
  organizationId: string;
  returnTo: string;
  rule: RuleRow | null;
  kind: "ARRIVAL" | "POST_STAY";
}) {
  const isArrival = kind === "ARRIVAL";
  const name = isArrival ? "Pre-arrival instructions" : "Post-stay thank you";
  const trigger = isArrival ? "BEFORE_CHECKIN" : "AFTER_CHECKOUT";
  const dayOffset = rule?.day_offset ?? (isArrival ? 3 : 1);
  const subject =
    rule?.subject_template ??
    (isArrival ? defaultArrivalSubject : defaultPostStaySubject);
  const body =
    rule?.body_template ?? (isArrival ? defaultArrivalBody : defaultPostStayBody);
  const requireAccessCode = rule?.require_access_code ?? isArrival;
  const defaultAccessCode = rule?.default_access_code ?? "";
  const defaultArrivalNotes = rule?.default_arrival_notes ?? "";

  return (
    <section className={`panel ${styles.editorPanel}`}>
      <div className={styles.panelHead}>
        <div className={styles.panelHeadCopy}>
          <p className="eyebrow dark">
            {isArrival ? "Pre-arrival email" : "Optional follow-up"}
          </p>
          <h2>{name}</h2>
          <p className={styles.panelDescription}>
            {isArrival
              ? "Guest and reservation details fill automatically. Save this property's access code and arrival notes here and they drop into the email when it sends."
              : "A simple automatic thank-you after checkout. Guest and stay information fills automatically."}
          </p>
        </div>
        <span
          className={`status-pill ${
            rule?.is_active ? "" : "status-muted"
          }`}
        >
          {rule ? (rule.is_active ? "Active" : "Paused") : "Not set up"}
        </span>
      </div>

      <form className={styles.editorForm} action={saveGuestEmailRule}>
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="rule_id" value={rule?.id || ""} />
        <input type="hidden" name="organization_id" value={organizationId} />
        <input type="hidden" name="property_id" value={propertyId} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="trigger_event" value={trigger} />
        <input
          type="hidden"
          name="is_active"
          value={rule?.is_active === false ? "off" : "on"}
        />

        <div className={styles.timingGrid}>
          <label>
            <span>{isArrival ? "Send before check-in" : "Send after checkout"}</span>
            <select name="day_offset" defaultValue={String(dayOffset)}>
              {isArrival ? (
                <>
                  <option value="0">Same day</option>
                  <option value="1">1 day before</option>
                  <option value="2">2 days before</option>
                  <option value="3">3 days before</option>
                  <option value="5">5 days before</option>
                  <option value="7">7 days before</option>
                </>
              ) : (
                <>
                  <option value="0">Same day</option>
                  <option value="1">1 day after</option>
                  <option value="2">2 days after</option>
                  <option value="3">3 days after</option>
                </>
              )}
            </select>
          </label>

          <label>
            <span>Local send time</span>
            <input
              name="send_time_local"
              type="time"
              defaultValue={timeValue(rule?.send_time_local)}
              required
            />
          </label>
        </div>

        {isArrival ? (
          <label className={styles.waitForCode}>
            <input
              name="require_access_code"
              type="checkbox"
              defaultChecked={requireAccessCode}
            />
            <span>
              Wait to send until an access / door code has been saved for this
              guest.
            </span>
          </label>
        ) : null}

        {!isArrival && requireAccessCode ? (
          <input type="hidden" name="require_access_code" value="on" />
        ) : null}

        {isArrival ? (
          <details
            className={styles.propertyDefaults}
            open={!defaultAccessCode && !defaultArrivalNotes}
          >
            <summary>Access code & arrival notes</summary>
            <div className={styles.defaultsBody}>
              <p className={styles.defaultsIntro}>
                Save the normal access information for this property. The email
                automatically inserts these values into {"{{access_code}}"} and
                {" {{arrival_notes}}"}.
              </p>
              <label>
                <span>Access / door code</span>
                <input
                  name="default_access_code"
                  maxLength={160}
                  defaultValue={defaultAccessCode}
                  placeholder="Example: 4821#"
                />
              </label>
              <label>
                <span>Arrival notes</span>
                <textarea
                  name="default_arrival_notes"
                  rows={5}
                  maxLength={5000}
                  defaultValue={defaultArrivalNotes}
                  placeholder="Parking, gate, lockbox, Wi-Fi, cabin directions, late arrival instructions…"
                />
              </label>
              <small className={styles.overrideNote}>
                If a specific reservation has its own access code or notes, that
                reservation-specific information overrides these property defaults.
              </small>
            </div>
          </details>
        ) : null}

        <details className={styles.customizer}>
          <summary>Customize email wording</summary>
          <div className={styles.customizerBody}>
            <label>
              <span>Subject</span>
              <input
                name="subject_template"
                defaultValue={subject}
                maxLength={200}
                required
              />
            </label>
            <label>
              <span>Message</span>
              <textarea
                name="body_template"
                rows={isArrival ? 14 : 10}
                defaultValue={body}
                maxLength={8000}
                required
              />
            </label>
            <p className={styles.variableHelp}>
              Auto-fill fields: {"{{guest_name}}"}, {"{{property_name}}"},{" "}
              {"{{check_in}}"}, {"{{check_out}}"},{" "}
              {"{{confirmation_code}}"}, {"{{access_code}}"},{" "}
              {"{{arrival_notes}}"}, {"{{host_name}}"},{" "}
              {"{{host_email}}"}, {"{{host_phone}}"} and {"{{trip_url}}"}.
            </p>
          </div>
        </details>

        <div className={styles.actionRow}>
          <button className="button button-small" type="submit">
            {rule ? "Save email setup" : "Turn on this email"}
          </button>
        </div>
      </form>

      {rule ? (
        <div className={styles.secondaryActions}>
          <form action={toggleGuestEmailRule}>
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="rule_id" value={rule.id} />
            <input type="hidden" name="organization_id" value={organizationId} />
            <input
              type="hidden"
              name="next_active"
              value={rule.is_active ? "false" : "true"}
            />
            <button className="button button-small button-quiet" type="submit">
              {rule.is_active ? "Pause email" : "Enable email"}
            </button>
          </form>

          {!isArrival ? (
            <form action={deleteGuestEmailRule}>
              <input type="hidden" name="return_to" value={returnTo} />
              <input type="hidden" name="rule_id" value={rule.id} />
              <input
                type="hidden"
                name="organization_id"
                value={organizationId}
              />
              <button className="text-danger-button" type="submit">
                Remove email
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default async function PropertyGuestEmailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ slug }, query, properties] = await Promise.all([
    params,
    searchParams,
    getHostProperties(),
  ]);

  const property = properties.find((item) => item.slug === slug);
  if (!property) notFound();

  const supabase = await createClient();
  const { data: rulesData } = await supabase
    .from("host_guest_email_rules")
    .select(
      "id,organization_id,property_id,name,trigger_event,day_offset,send_time_local,subject_template,body_template,require_access_code,default_access_code,default_arrival_notes,is_active,created_at",
    )
    .eq("property_id", property.id)
    .order("created_at", { ascending: true });

  const rules = (rulesData ?? []) as RuleRow[];

  const arrivalRule =
    rules.find(
      (rule) =>
        rule.trigger_event === "BEFORE_CHECKIN" &&
        rule.name === "Pre-arrival instructions",
    ) ?? rules.find((rule) => rule.trigger_event === "BEFORE_CHECKIN") ?? null;

  const postStayRule =
    rules.find(
      (rule) =>
        rule.trigger_event === "AFTER_CHECKOUT" &&
        rule.name === "Post-stay thank you",
    ) ?? rules.find((rule) => rule.trigger_event === "AFTER_CHECKOUT") ?? null;

  const extraRules = rules.filter(
    (rule) => rule.id !== arrivalRule?.id && rule.id !== postStayRule?.id,
  );

  const returnTo = `/host/guest-emails/${property.slug}`;

  return (
    <DashboardShell active="Guest emails" title={`${property.name} guest emails`}>
      <div className={styles.detailHead}>
        <div className={styles.detailHeadCopy}>
          <p>
            Guest and reservation information fills itself. Keep the template
            as-is or customize it, then save this property's access code and
            arrival notes right in the pre-arrival email setup.
          </p>
        </div>
        <Link className="button button-small button-quiet" href="/host/guest-emails">
          ← All properties
        </Link>
      </div>

      {query.saved ? (
        <div className="admin-message success">Guest email settings saved.</div>
      ) : null}
      {query.error ? (
        <div className="admin-message error">{query.error}</div>
      ) : null}

      <section className={`panel ${styles.infoPanel}`}>
        <div className={styles.panelHead}>
          <div className={styles.panelHeadCopy}>
            <p className="eyebrow dark">How it works</p>
            <h2>Most of the email is automatic.</h2>
          </div>
          <span className="status-pill">Property specific</span>
        </div>
        <p className={styles.panelDescription}>
          Find A Place automatically inserts the guest name, property name,
          check-in and checkout dates, confirmation number, host contact info
          and the guest&apos;s My Trip link. The access code and arrival notes come
          from the property defaults saved in the pre-arrival email. A
          reservation-specific value can override the default when needed.
        </p>
      </section>

      <AutomationEditor
        propertyId={property.id}
        organizationId={property.organizationId}
        returnTo={returnTo}
        rule={arrivalRule}
        kind="ARRIVAL"
      />

      <AutomationEditor
        propertyId={property.id}
        organizationId={property.organizationId}
        returnTo={returnTo}
        rule={postStayRule}
        kind="POST_STAY"
      />

      {extraRules.length ? (
        <section className={`panel ${styles.extraPanel}`}>
          <div className={styles.panelHead}>
            <div className={styles.panelHeadCopy}>
              <p className="eyebrow dark">Existing automations</p>
              <h2>Other saved emails</h2>
            </div>
            <span className={styles.countBadge}>{extraRules.length}</span>
          </div>
          <div className={styles.extraList}>
            {extraRules.map((rule) => (
              <div className={styles.extraCard} key={rule.id}>
                <div className={styles.extraHeader}>
                  <div>
                    <strong>{rule.name}</strong>
                    <p className={styles.extraMeta}>
                      {automationTiming(rule)} · {timeValue(rule.send_time_local)} local
                    </p>
                  </div>
                  <span
                    className={`status-pill ${
                      rule.is_active ? "" : "status-muted"
                    }`}
                  >
                    {rule.is_active ? "Active" : "Paused"}
                  </span>
                </div>

                <details className={styles.customizer}>
                  <summary>Edit existing email</summary>
                  <form
                    className={styles.legacyForm}
                    action={saveGuestEmailRule}
                  >
                    <input type="hidden" name="return_to" value={returnTo} />
                    <input type="hidden" name="rule_id" value={rule.id} />
                    <input
                      type="hidden"
                      name="organization_id"
                      value={property.organizationId}
                    />
                    <input type="hidden" name="property_id" value={property.id} />
                    <input
                      type="hidden"
                      name="trigger_event"
                      value={rule.trigger_event}
                    />
                    <input
                      type="hidden"
                      name="is_active"
                      value={rule.is_active ? "on" : "off"}
                    />
                    <label>
                      <span>Name</span>
                      <input name="name" defaultValue={rule.name} required />
                    </label>
                    <div className={styles.legacyGrid}>
                      <label>
                        <span>Days</span>
                        <input
                          name="day_offset"
                          type="number"
                          min="0"
                          max="60"
                          defaultValue={rule.day_offset}
                          required
                        />
                      </label>
                      <label>
                        <span>Local send time</span>
                        <input
                          name="send_time_local"
                          type="time"
                          defaultValue={timeValue(rule.send_time_local)}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      <span>Subject</span>
                      <input
                        name="subject_template"
                        defaultValue={rule.subject_template}
                        required
                      />
                    </label>
                    <label>
                      <span>Message</span>
                      <textarea
                        name="body_template"
                        rows={10}
                        defaultValue={rule.body_template}
                        required
                      />
                    </label>
                    <label className={styles.waitForCode}>
                      <input
                        name="require_access_code"
                        type="checkbox"
                        defaultChecked={rule.require_access_code}
                      />
                      <span>Wait for an access code before sending.</span>
                    </label>
                    <button className="button button-small" type="submit">
                      Save changes
                    </button>
                  </form>
                </details>

                <div className={styles.secondaryActions}>
                  <form action={toggleGuestEmailRule}>
                    <input type="hidden" name="return_to" value={returnTo} />
                    <input type="hidden" name="rule_id" value={rule.id} />
                    <input
                      type="hidden"
                      name="organization_id"
                      value={property.organizationId}
                    />
                    <input
                      type="hidden"
                      name="next_active"
                      value={rule.is_active ? "false" : "true"}
                    />
                    <button className="button button-small button-quiet" type="submit">
                      {rule.is_active ? "Pause" : "Enable"}
                    </button>
                  </form>
                  <form action={deleteGuestEmailRule}>
                    <input type="hidden" name="return_to" value={returnTo} />
                    <input type="hidden" name="rule_id" value={rule.id} />
                    <input
                      type="hidden"
                      name="organization_id"
                      value={property.organizationId}
                    />
                    <button className="text-danger-button" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
