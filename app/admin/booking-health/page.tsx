import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { formatAdminDate } from "@/lib/admin/format";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createClient } from "@/lib/supabase/server";

type AttemptRow = {
  id: string;
  unit_id: string | null;
  reservation_id: string | null;
  current_stage: string;
  last_event: string;
  outcome: string | null;
  started_at: string;
  last_seen_at: string;
};

type EventRow = {
  attempt_id: string;
  unit_id: string | null;
  reservation_id: string | null;
  event_name: string;
  stage: string;
  success: boolean | null;
  status_code: number | null;
  error_message: string | null;
  created_at: string;
};

const FUNNEL = [
  ["Stay viewed", "stay_page_viewed"],
  ["Availability loaded", "availability_succeeded"],
  ["Checkout clicked", "checkout_clicked"],
  ["Checkout opened", "checkout_page_viewed"],
  ["Hold created", "hold_created"],
  ["Email verified", "verification_succeeded"],
  ["Policies accepted", "policy_accepted"],
  ["Payment ready", "payment_intent_ready"],
  ["Pay clicked", "payment_submit_clicked"],
  ["Confirmed", "booking_confirmed"],
] as const;

export default async function BookingHealthPage() {
  const context = await getAdminContext();
  const supabase = await createClient();
  const environment = stripeEnvironment();
  const since = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: attemptsData }, { data: eventsData }] =
    await Promise.all([
      supabase
        .from("booking_attempts")
        .select(
          "id,unit_id,reservation_id,current_stage,last_event,outcome,started_at,last_seen_at",
        )
        .eq("payment_environment", environment)
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(2000),
      supabase
        .from("booking_attempt_events")
        .select(
          "attempt_id,unit_id,reservation_id,event_name,stage,success,status_code,error_message,created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

  const attempts = (attemptsData ?? []) as AttemptRow[];
  const events = (eventsData ?? []) as EventRow[];

  const attemptIds = new Set(
    attempts.map((attempt) => attempt.id),
  );

  const scopedEvents = events.filter((event) =>
    attemptIds.has(event.attempt_id),
  );

  const unitIds = [
    ...new Set(
      attempts
        .map((attempt) => attempt.unit_id)
        .filter(
          (value): value is string => Boolean(value),
        ),
    ),
  ];

  const { data: unitsData } = unitIds.length
    ? await supabase
        .from("property_units")
        .select("id,name,property_id")
        .in("id", unitIds)
    : { data: [] };

  const propertyIds = [
    ...new Set(
      (unitsData ?? [])
        .map(
          (unit) =>
            unit.property_id as string | null,
        )
        .filter(
          (value): value is string => Boolean(value),
        ),
    ),
  ];

  const { data: propertiesData } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id,name")
        .in("id", propertyIds)
    : { data: [] };

  const properties = new Map(
    (propertiesData ?? []).map((property) => [
      property.id as string,
      property.name as string,
    ]),
  );

  const unitLabels = new Map(
    (unitsData ?? []).map((unit) => [
      unit.id as string,
      properties.get(unit.property_id as string) ||
        (unit.name as string) ||
        "Unknown stay",
    ]),
  );

  const reached = new Map<string, Set<string>>();

  for (const [, eventName] of FUNNEL) {
    reached.set(eventName, new Set());
  }

  for (const event of scopedEvents) {
    reached
      .get(event.event_name)
      ?.add(event.attempt_id);
  }

  const failureGroups = new Map<
    string,
    {
      eventName: string;
      message: string;
      count: number;
      lastAt: string;
    }
  >();

  for (const event of scopedEvents.filter(
    (row) => row.success === false,
  )) {
    const message =
      event.error_message ||
      `HTTP ${event.status_code || "error"}`;
    const key = `${event.event_name}::${message}`;
    const current = failureGroups.get(key);

    if (current) {
      current.count += 1;
      if (event.created_at > current.lastAt) {
        current.lastAt = event.created_at;
      }
    } else {
      failureGroups.set(key, {
        eventName: event.event_name,
        message,
        count: 1,
        lastAt: event.created_at,
      });
    }
  }

  const staleBefore = Date.now() - 10 * 60 * 1000;

  const possibleDropoffs = attempts
    .filter(
      (attempt) =>
        attempt.outcome !== "CONFIRMED" &&
        attempt.outcome !== "CANCELLED" &&
        new Date(attempt.last_seen_at).getTime() <
          staleBefore,
    )
    .slice(0, 30);

  const failures = [...failureGroups.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.lastAt.localeCompare(a.lastAt),
    )
    .slice(0, 20);

  const confirmed =
    reached.get("booking_confirmed")?.size ?? 0;
  const started =
    reached.get("stay_page_viewed")?.size ||
    attempts.length;

  const confirmationRate = started
    ? Math.round((confirmed / started) * 100)
    : 0;

  return (
    <AdminShell
      active="booking-health"
      eyebrow="Guest funnel observability"
      title="Booking health"
      context={context}
    >
      <div className="admin-launch-banner">
        <div>
          <span>
            {environment} checkout tracking · last 7 days
          </span>
          <p>
            Anonymous funnel events show where guests stop,
            what failed, and which step they last reached.
            Guest names, emails, phone numbers, card details
            and checkout tokens are not stored here.
          </p>
        </div>
        <span className="status-pill status-inverse">
          {confirmationRate}% confirmed
        </span>
      </div>

      <div className="dash-grid metrics admin-metrics admin-real-metrics">
        {FUNNEL.map(([label, eventName]) => (
          <div
            className="admin-metric-card admin-metric-card-static"
            key={eventName}
          >
            <span>{label}</span>
            <strong>
              {reached.get(eventName)?.size ?? 0}
            </strong>
            <small>unique booking attempts</small>
          </div>
        ))}
      </div>

      <div className="dash-two admin-home-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">
                Possible drop-offs
              </p>
              <h2>Where guests stopped</h2>
            </div>
            <span className="status-pill status-muted">
              {possibleDropoffs.length} shown
            </span>
          </div>

          {possibleDropoffs.length ? (
            <div className="admin-list">
              {possibleDropoffs.map((attempt) => (
                <Link
                  className="admin-list-row"
                  href={`/admin/booking-health/${attempt.id}`}
                  key={attempt.id}
                >
                  <span>
                    <strong>
                      {attempt.unit_id
                        ? unitLabels.get(attempt.unit_id) ||
                          "Unknown stay"
                        : "Stay not resolved"}
                    </strong>
                    <small>
                      {attempt.current_stage.replaceAll(
                        "_",
                        " ",
                      )}{" "}
                      · last event{" "}
                      {attempt.last_event.replaceAll(
                        "_",
                        " ",
                      )}{" "}
                      ·{" "}
                      {formatAdminDate(
                        attempt.last_seen_at,
                      )}
                    </small>
                  </span>
                  <b>{attempt.outcome || "LEFT"}</b>
                </Link>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <strong>
                No stale incomplete attempts in this
                window.
              </strong>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">
                Errors and friction
              </p>
              <h2>What guests hit</h2>
            </div>
            <span className="status-pill status-muted">
              {failures.length} groups
            </span>
          </div>

          {failures.length ? (
            <div className="admin-list">
              {failures.map((failure) => (
                <div
                  className="admin-list-row static"
                  key={`${failure.eventName}:${failure.message}`}
                >
                  <span>
                    <strong>
                      {failure.eventName.replaceAll(
                        "_",
                        " ",
                      )}
                    </strong>
                    <small>
                      {failure.message} · last{" "}
                      {formatAdminDate(failure.lastAt)}
                    </small>
                  </span>
                  <b>{failure.count}×</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <strong>
                No tracked checkout failures in this
                window.
              </strong>
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">
              Recent sessions
            </p>
            <h2>Latest booking attempts</h2>
          </div>
          <span className="status-pill status-muted">
            {attempts.length} total
          </span>
        </div>

        {attempts.length ? (
          <div className="admin-list">
            {attempts.slice(0, 50).map((attempt) => (
              <Link
                className="admin-list-row"
                href={`/admin/booking-health/${attempt.id}`}
                key={attempt.id}
              >
                <span>
                  <strong>
                    {attempt.unit_id
                      ? unitLabels.get(attempt.unit_id) ||
                        "Unknown stay"
                      : "Stay not resolved"}
                  </strong>
                  <small>
                    {attempt.current_stage.replaceAll(
                      "_",
                      " ",
                    )}{" "}
                    ·{" "}
                    {attempt.last_event.replaceAll(
                      "_",
                      " ",
                    )}{" "}
                    ·{" "}
                    {formatAdminDate(
                      attempt.last_seen_at,
                    )}
                  </small>
                </span>
                <b>
                  {attempt.outcome || "INCOMPLETE"}
                </b>
              </Link>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>
              No tracked booking attempts yet.
            </strong>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
