import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

type RuleSummary = {
  property_id: string | null;
  trigger_event: "BEFORE_CHECKIN" | "AFTER_CHECKOUT";
  is_active: boolean;
  require_access_code: boolean;
};

type ReservationSummary = {
  id: string;
  property_id: string;
};

type InstructionSummary = {
  reservation_id: string;
  access_code: string | null;
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

  const today = new Date().toISOString().slice(0, 10);

  const [rulesResult, reservationsResult] = propertyIds.length
    ? await Promise.all([
        supabase
          .from("host_guest_email_rules")
          .select("property_id,trigger_event,is_active,require_access_code")
          .in("property_id", propertyIds),
        supabase
          .from("reservations")
          .select("id,property_id")
          .in("property_id", propertyIds)
          .eq("status", "CONFIRMED")
          .gte("check_out", today),
      ])
    : [
        { data: [] as RuleSummary[] },
        { data: [] as ReservationSummary[] },
      ];

  const reservations = (reservationsResult.data ?? []) as ReservationSummary[];
  const reservationIds = reservations.map((reservation) => reservation.id);

  const { data: instructionData } = reservationIds.length
    ? await supabase
        .from("reservation_guest_instructions")
        .select("reservation_id,access_code")
        .in("reservation_id", reservationIds)
    : { data: [] as InstructionSummary[] };

  const rules = (rulesResult.data ?? []) as RuleSummary[];
  const instructions = (instructionData ?? []) as InstructionSummary[];
  const instructionByReservation = new Map(
    instructions.map((instruction) => [instruction.reservation_id, instruction]),
  );

  const rulesByProperty = new Map<string, RuleSummary[]>();
  for (const rule of rules) {
    if (!rule.property_id) continue;
    const current = rulesByProperty.get(rule.property_id) ?? [];
    current.push(rule);
    rulesByProperty.set(rule.property_id, current);
  }

  const reservationsByProperty = new Map<string, ReservationSummary[]>();
  for (const reservation of reservations) {
    const current = reservationsByProperty.get(reservation.property_id) ?? [];
    current.push(reservation);
    reservationsByProperty.set(reservation.property_id, current);
  }

  return (
    <DashboardShell active="Guest emails" title="Guest emails">
      <div className="dash-toolbar pricing-toolbar">
        <div>
          <p>
            Set up automated guest emails one property at a time. Guest names,
            stay dates, confirmation numbers and trip links fill automatically;
            you only add the access code and property-specific arrival notes for
            each stay.
          </p>
        </div>
        <Link className="button button-small button-quiet" href="/host/properties">
          Properties
        </Link>
      </div>

      {properties.length ? (
        <div className="pricing-property-list">
          {properties.map((property) => {
            const propertyRules = rulesByProperty.get(property.id) ?? [];
            const activeRules = propertyRules.filter((rule) => rule.is_active);
            const preArrivalRule = propertyRules.find(
              (rule) => rule.trigger_event === "BEFORE_CHECKIN",
            );
            const upcoming = reservationsByProperty.get(property.id) ?? [];
            const missingAccess = preArrivalRule?.require_access_code
              ? upcoming.filter(
                  (reservation) =>
                    !instructionByReservation
                      .get(reservation.id)
                      ?.access_code?.trim(),
                ).length
              : 0;

            return (
              <Link
                className="pricing-property-card"
                href={`/host/guest-emails/${property.slug}`}
                key={property.id}
              >
                <div className="pricing-property-photo">
                  {property.coverImageUrl ? (
                    <img src={property.coverImageUrl} alt="" />
                  ) : (
                    <span>No photo</span>
                  )}
                </div>

                <div className="pricing-property-copy">
                  <small>{statusLabel(property.status)}</small>
                  <h2>{property.name}</h2>
                  <p>
                    {property.publicArea ||
                      [property.city, property.state].filter(Boolean).join(", ") ||
                      "Location not set"}
                  </p>
                </div>

                <div className="pricing-property-rate">
                  <small>Guest emails</small>
                  <strong>
                    {activeRules.length
                      ? `${activeRules.length} active`
                      : "Not set up"}
                  </strong>
                  <span>
                    {preArrivalRule
                      ? preArrivalRule.is_active
                        ? "Pre-arrival email on"
                        : "Pre-arrival email paused"
                      : "Ready-made template available"}
                  </span>
                </div>

                <div className="pricing-property-meta">
                  <span>
                    <b>{upcoming.length}</b> upcoming stays
                  </span>
                  <span>
                    <b>{missingAccess}</b> need access info
                  </span>
                  <span>
                    <b>{propertyRules.length}</b> saved automations
                  </span>
                </div>

                <strong className="pricing-open">Manage →</strong>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <div className="panel-empty panel-empty-large">
            <strong>Add a property before setting up guest emails.</strong>
            <span>
              Each property gets its own email template and upcoming guest
              access instructions.
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
