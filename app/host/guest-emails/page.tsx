import { DashboardShell } from "@/components/DashboardShell";
import {
  getHostProperties,
  getManagedOrganizations,
} from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

import {
  deleteGuestEmailRule,
  saveGuestEmailRule,
  saveReservationGuestInstructions,
  toggleGuestEmailRule,
} from "./actions";

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
  is_active: boolean;
};

const defaultSubject = "Your stay at {{property_name}} is coming up";
const defaultBody = `Hi {{guest_name}},

Your stay at {{property_name}} is coming up.

Check-in: {{check_in}}
Check-out: {{check_out}}
Access code: {{access_code}}

{{arrival_notes}}

You can review your reservation or message us here:
{{trip_url}}

— {{host_name}}`;

function readableTrigger(rule: RuleRow) {
  return rule.trigger_event === "BEFORE_CHECKIN"
    ? `${rule.day_offset} day${rule.day_offset === 1 ? "" : "s"} before check-in`
    : `${rule.day_offset} day${rule.day_offset === 1 ? "" : "s"} after checkout`;
}

export default async function GuestEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [properties, organizations, params] = await Promise.all([
    getHostProperties(),
    getManagedOrganizations(),
    searchParams,
  ]);

  const supabase = await createClient();
  const organizationIds = organizations.map((organization) => organization.id);

  const { data: rulesData } = organizationIds.length
    ? await supabase
        .from("host_guest_email_rules")
        .select(
          "id,organization_id,property_id,name,trigger_event,day_offset,send_time_local,subject_template,body_template,require_access_code,is_active",
        )
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const today = new Date().toISOString().slice(0, 10);
  const { data: reservationsData } = organizationIds.length
    ? await supabase
        .from("reservations")
        .select(
          "id,confirmation_code,organization_id,property_id,guest_name,guest_email,check_in,check_out,status",
        )
        .in("organization_id", organizationIds)
        .eq("status", "CONFIRMED")
        .gte("check_out", today)
        .order("check_in", { ascending: true })
        .limit(100)
    : { data: [] };

  const reservationIds = (reservationsData ?? []).map((row) => row.id);
  const { data: instructionData } = reservationIds.length
    ? await supabase
        .from("reservation_guest_instructions")
        .select("reservation_id,access_code,arrival_notes")
        .in("reservation_id", reservationIds)
    : { data: [] };

  const instructionByReservation = new Map(
    (instructionData ?? []).map((row) => [row.reservation_id, row]),
  );
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const rules = (rulesData ?? []) as RuleRow[];
  const firstOrganizationId = organizationIds[0] ?? "";

  return (
    <DashboardShell
      active="Guest emails"
      title="Guest emails"
      eyebrow="Automated stay communication"
    >
      {params.saved ? (
        <div className="admin-message success">Guest email settings saved.</div>
      ) : null}
      {params.error ? (
        <div className="admin-message error">{params.error}</div>
      ) : null}

      <section className="panel">
        <p className="eyebrow dark">Automations</p>
        <h2>Send reservation emails automatically.</h2>
        <p className="muted">
          Use these for pre-arrival instructions, door/access codes, check-in
          reminders and post-stay messages. These are reservation communications,
          not marketing campaigns.
        </p>

        <form className="settings-form" action={saveGuestEmailRule}>
          <label>
            <span>Host account</span>
            <select
              name="organization_id"
              defaultValue={firstOrganizationId}
              required
            >
              {organizations.map((organization) => (
                <option value={organization.id} key={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Automation name</span>
            <input
              name="name"
              defaultValue="Pre-arrival instructions"
              required
              maxLength={120}
            />
          </label>

          <label>
            <span>Property</span>
            <select name="property_id" defaultValue="">
              <option value="">All properties in the selected host account</option>
              {properties.map((property) => (
                <option value={property.id} key={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>

          <div className="field-grid">
            <label>
              <span>Send</span>
              <select name="trigger_event" defaultValue="BEFORE_CHECKIN">
                <option value="BEFORE_CHECKIN">Before check-in</option>
                <option value="AFTER_CHECKOUT">After checkout</option>
              </select>
            </label>

            <label>
              <span>Days</span>
              <input
                name="day_offset"
                type="number"
                min="0"
                max="60"
                defaultValue="3"
                required
              />
            </label>

            <label>
              <span>Local send time</span>
              <input
                name="send_time_local"
                type="time"
                defaultValue="10:00"
                required
              />
            </label>
          </div>

          <label>
            <span>Subject</span>
            <input
              name="subject_template"
              defaultValue={defaultSubject}
              maxLength={200}
              required
            />
          </label>

          <label>
            <span>Message</span>
            <textarea
              name="body_template"
              rows={12}
              defaultValue={defaultBody}
              maxLength={8000}
              required
            />
          </label>

          <label className="checkline">
            <input name="require_access_code" type="checkbox" defaultChecked />
            <span>
              Wait to send until an access code has been saved for the reservation.
            </span>
          </label>

          <input type="hidden" name="is_active" value="on" />

          <button
            className="button button-small"
            type="submit"
            disabled={!firstOrganizationId}
          >
            Create automation
          </button>
        </form>

        <p className="muted">
          Available variables: {"{{guest_name}}"}, {"{{property_name}}"},{" "}
          {"{{check_in}}"}, {"{{check_out}}"}, {"{{confirmation_code}}"},{" "}
          {"{{access_code}}"}, {"{{arrival_notes}}"}, {"{{host_name}}"},{" "}
          {"{{host_email}}"}, {"{{host_phone}}"} and {"{{trip_url}}"}.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Saved automations</p>
            <h2>{rules.length ? `${rules.length} configured` : "No automations yet"}</h2>
          </div>
        </div>

        {rules.length ? (
          <div className="review-groups">
            {rules.map((rule) => {
              const property = rule.property_id
                ? propertyById.get(rule.property_id)
                : null;

              return (
                <div key={rule.id}>
                  <div className="panel-head">
                    <div>
                      <strong>{rule.name}</strong>
                      <p className="muted">
                        {property?.name || "All properties"} · {readableTrigger(rule)} ·{" "}
                        {String(rule.send_time_local).slice(0, 5)} local
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

                  <form className="settings-form" action={saveGuestEmailRule}>
                    <input type="hidden" name="rule_id" value={rule.id} />
                    <input
                      type="hidden"
                      name="organization_id"
                      value={rule.organization_id}
                    />

                    <label>
                      <span>Name</span>
                      <input
                        name="name"
                        defaultValue={rule.name}
                        required
                        maxLength={120}
                      />
                    </label>

                    <label>
                      <span>Property</span>
                      <select
                        name="property_id"
                        defaultValue={rule.property_id || ""}
                      >
                        <option value="">All properties</option>
                        {properties
                          .filter(
                            (item) =>
                              item.organizationId === rule.organization_id,
                          )
                          .map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </select>
                    </label>

                    <div className="field-grid">
                      <label>
                        <span>Trigger</span>
                        <select
                          name="trigger_event"
                          defaultValue={rule.trigger_event}
                        >
                          <option value="BEFORE_CHECKIN">Before check-in</option>
                          <option value="AFTER_CHECKOUT">After checkout</option>
                        </select>
                      </label>
                      <label>
                        <span>Days</span>
                        <input
                          name="day_offset"
                          type="number"
                          min="0"
                          max="60"
                          defaultValue={rule.day_offset}
                        />
                      </label>
                      <label>
                        <span>Local send time</span>
                        <input
                          name="send_time_local"
                          type="time"
                          defaultValue={String(rule.send_time_local).slice(0, 5)}
                        />
                      </label>
                    </div>

                    <label>
                      <span>Subject</span>
                      <input
                        name="subject_template"
                        defaultValue={rule.subject_template}
                        maxLength={200}
                        required
                      />
                    </label>

                    <label>
                      <span>Message</span>
                      <textarea
                        name="body_template"
                        rows={9}
                        defaultValue={rule.body_template}
                        maxLength={8000}
                        required
                      />
                    </label>

                    <label className="checkline">
                      <input
                        name="require_access_code"
                        type="checkbox"
                        defaultChecked={rule.require_access_code}
                      />
                      <span>Require an access code before sending.</span>
                    </label>

                    <input
                      type="hidden"
                      name="is_active"
                      value={rule.is_active ? "on" : "off"}
                    />
                    <button className="button button-small" type="submit">
                      Save changes
                    </button>
                  </form>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <form action={toggleGuestEmailRule}>
                      <input type="hidden" name="rule_id" value={rule.id} />
                      <input
                        type="hidden"
                        name="organization_id"
                        value={rule.organization_id}
                      />
                      <input
                        type="hidden"
                        name="next_active"
                        value={rule.is_active ? "false" : "true"}
                      />
                      <button
                        className="button button-small button-quiet"
                        type="submit"
                      >
                        {rule.is_active ? "Pause" : "Enable"}
                      </button>
                    </form>

                    <form action={deleteGuestEmailRule}>
                      <input type="hidden" name="rule_id" value={rule.id} />
                      <input
                        type="hidden"
                        name="organization_id"
                        value={rule.organization_id}
                      />
                      <button className="text-danger-button" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            Create the first rule above. Nothing is sent until an active rule is due.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Upcoming stays</p>
            <h2>Door codes & arrival notes</h2>
          </div>
        </div>
        <p className="muted">
          These details are private to the reservation and can be inserted into
          automated emails with {"{{access_code}}"} and {"{{arrival_notes}}"}.
        </p>

        {(reservationsData ?? []).length ? (
          <div className="review-groups">
            {(reservationsData ?? []).map((reservation) => {
              const property = propertyById.get(reservation.property_id);
              const instructions = instructionByReservation.get(reservation.id);

              return (
                <div key={reservation.id}>
                  <strong>
                    {property?.name || "Property"} ·{" "}
                    {reservation.guest_name || "Guest"}
                  </strong>
                  <p className="muted">
                    {reservation.check_in} → {reservation.check_out} ·{" "}
                    {reservation.confirmation_code}
                  </p>

                  <form
                    className="settings-form"
                    action={saveReservationGuestInstructions}
                  >
                    <input
                      type="hidden"
                      name="reservation_id"
                      value={reservation.id}
                    />
                    <label>
                      <span>Access / door code</span>
                      <input
                        name="access_code"
                        maxLength={160}
                        defaultValue={instructions?.access_code || ""}
                        placeholder="Example: 4821#"
                      />
                    </label>
                    <label>
                      <span>Arrival notes</span>
                      <textarea
                        name="arrival_notes"
                        rows={4}
                        maxLength={5000}
                        defaultValue={instructions?.arrival_notes || ""}
                        placeholder="Parking, gate, lockbox, Wi-Fi, late arrival instructions…"
                      />
                    </label>
                    <button className="button button-small" type="submit">
                      Save guest instructions
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No upcoming confirmed Find A Place stays yet.</p>
        )}
      </section>
    </DashboardShell>
  );
}
