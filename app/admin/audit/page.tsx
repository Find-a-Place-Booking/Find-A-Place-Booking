import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import {
  activityCategory,
  activityCategoryLabel,
  activityTitle,
  type ActivityCategory,
} from "@/lib/admin/activity";
import { getAdminContext } from "@/lib/admin/context";
import { formatAdminDate } from "@/lib/admin/format";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  actor_profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  event_category: string | null;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
};

type Actor = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Reservation = {
  id: string;
  confirmation_code: string;
  property_id: string;
  organization_id: string;
  guest_name: string | null;
  guest_email: string | null;
  check_in: string;
  check_out: string;
  guest_count: number;
  pet_count: number;
  guest_total_cents: number;
  platform_commission_cents: number;
  currency: string;
  status: string;
  payment_status: string;
  payment_environment: "TEST" | "LIVE";
};

type Property = {
  id: string;
  organization_id: string;
  name: string;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  status: string;
};

type Organization = {
  id: string;
  name: string;
};

type PaymentAccount = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  charges_enabled: boolean;
  provider_account_id: string | null;
  environment?: string | null;
};

const categoryOptions: Array<["ALL" | ActivityCategory, string]> = [
  ["ALL", "All activity"],
  ["booking", "Bookings"],
  ["cancellation", "Cancellations"],
  ["payment", "Payments"],
  ["property", "Properties"],
  ["account", "Hosts & accounts"],
  ["content", "Site content"],
  ["admin", "Admin"],
  ["other", "Other"],
];

function money(cents: number | null | undefined, currency = "USD") {
  if (!Number.isFinite(Number(cents))) return null;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(Number(cents) / 100);
}

function shortDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function textMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function detailRows(
  event: AuditRow,
  reservation: Reservation | undefined,
  property: Property | undefined,
  organization: Organization | undefined,
  paymentAccount: PaymentAccount | undefined,
) {
  const rows: Array<[string, string]> = [];

  if (reservation) {
    rows.push(["Confirmation", reservation.confirmation_code]);
    rows.push([
      "Stay",
      `${shortDate(reservation.check_in)} → ${shortDate(
        reservation.check_out,
      )}`,
    ]);
    rows.push([
      "Guests",
      `${reservation.guest_count}${
        reservation.pet_count
          ? ` · ${reservation.pet_count} pet${reservation.pet_count === 1 ? "" : "s"}`
          : ""
      }`,
    ]);
    rows.push([
      "Booking total",
      money(reservation.guest_total_cents, reservation.currency) || "—",
    ]);
    rows.push(["Booking status", reservation.status.replaceAll("_", " ")]);
    rows.push([
      "Payment status",
      reservation.payment_status.replaceAll("_", " "),
    ]);

    if (
      event.action.includes("payment") ||
      event.action.includes("refund")
    ) {
      rows.push([
        "Find A Place commission",
        money(
          reservation.platform_commission_cents,
          reservation.currency,
        ) || "—",
      ]);
    }
  }

  if (property) {
    rows.push(["Property", property.name]);
    const area =
      property.public_area ||
      [property.city, property.region_code].filter(Boolean).join(", ");
    if (area) rows.push(["Area", area]);
    rows.push(["Property status", property.status.replaceAll("_", " ")]);
  }

  if (organization) rows.push(["Host organization", organization.name]);

  if (paymentAccount) {
    rows.push(["Processor", paymentAccount.provider]);
    rows.push([
      "Stripe status",
      paymentAccount.status.replaceAll("_", " "),
    ]);
    rows.push([
      "Charges enabled",
      paymentAccount.charges_enabled ? "Yes" : "No",
    ]);
    if (paymentAccount.environment) {
      rows.push(["Environment", paymentAccount.environment]);
    }
  }

  const cancellationReason =
    textMetadata(event.metadata, "reason") ||
    textMetadata(event.metadata, "host_response");
  if (cancellationReason) rows.push(["Note", cancellationReason]);

  return rows;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const context = await getAdminContext();
  const { q = "", category = "ALL" } = await searchParams;
  const search = q.trim().toLowerCase();
  const selectedCategory = categoryOptions.some(([value]) => value === category)
    ? category
    : "ALL";

  const environment = stripeEnvironment();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id,actor_profile_id,action,entity_type,entity_id,reason,metadata,event_category,source_table,source_id,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const events = (data ?? []) as AuditRow[];

  const actorIds = [
    ...new Set(
      events
        .map((event) => event.actor_profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const reservationIds = [
    ...new Set(
      events
        .filter((event) => event.entity_type === "reservation")
        .map((event) => event.entity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const propertyEntityIds = [
    ...new Set(
      events
        .filter((event) => event.entity_type === "property")
        .map((event) => event.entity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const profileEntityIds = [
    ...new Set(
      events
        .filter((event) => event.entity_type === "profile")
        .map((event) => event.entity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const organizationEntityIds = [
    ...new Set(
      events
        .filter((event) => event.entity_type === "organization")
        .map((event) => event.entity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const paymentAccountIds = [
    ...new Set(
      events
        .filter((event) => event.entity_type === "payment_account")
        .map((event) => event.entity_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [
    actorResult,
    reservationResult,
    propertyEntityResult,
    profileEntityResult,
    organizationEntityResult,
    paymentAccountResult,
  ] = await Promise.all([
    actorIds.length
      ? supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", actorIds)
      : Promise.resolve({ data: [] }),
    reservationIds.length
      ? supabase
          .from("reservations")
          .select(
            "id,confirmation_code,property_id,organization_id,guest_name,guest_email,check_in,check_out,guest_count,pet_count,guest_total_cents,platform_commission_cents,currency,status,payment_status,payment_environment",
          )
          .in("id", reservationIds)
          .eq("payment_environment", environment)
      : Promise.resolve({ data: [] }),
    propertyEntityIds.length
      ? supabase
          .from("properties")
          .select(
            "id,organization_id,name,public_area,city,region_code,status",
          )
          .in("id", propertyEntityIds)
      : Promise.resolve({ data: [] }),
    profileEntityIds.length
      ? supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", profileEntityIds)
      : Promise.resolve({ data: [] }),
    organizationEntityIds.length
      ? supabase
          .from("organizations")
          .select("id,name")
          .in("id", organizationEntityIds)
      : Promise.resolve({ data: [] }),
    paymentAccountIds.length
      ? supabase
          .from("payment_accounts")
          .select(
            "id,organization_id,provider,status,charges_enabled,provider_account_id,environment",
          )
          .in("id", paymentAccountIds)
          .eq("environment", environment)
      : Promise.resolve({ data: [] }),
  ]);

  const actors = (actorResult.data ?? []) as Actor[];
  const reservations = (reservationResult.data ?? []) as Reservation[];
  const propertyEntities = (propertyEntityResult.data ?? []) as Property[];
  const profileEntities = (profileEntityResult.data ?? []) as Actor[];
  const organizationEntities = (organizationEntityResult.data ??
    []) as Organization[];
  const paymentAccounts = (paymentAccountResult.data ??
    []) as PaymentAccount[];

  const propertyIdsFromReservations = reservations.map(
    (reservation) => reservation.property_id,
  );
  const organizationIdsFromReservations = reservations.map(
    (reservation) => reservation.organization_id,
  );
  const organizationIdsFromProperties = propertyEntities.map(
    (property) => property.organization_id,
  );
  const organizationIdsFromPayments = paymentAccounts.map(
    (account) => account.organization_id,
  );

  const extraPropertyIds = [
    ...new Set(
      propertyIdsFromReservations.filter(
        (id) => !propertyEntityIds.includes(id),
      ),
    ),
  ];

  const allOrganizationIds = [
    ...new Set([
      ...organizationEntityIds,
      ...organizationIdsFromReservations,
      ...organizationIdsFromProperties,
      ...organizationIdsFromPayments,
    ]),
  ];

  const [extraPropertyResult, allOrganizationResult] = await Promise.all([
    extraPropertyIds.length
      ? supabase
          .from("properties")
          .select(
            "id,organization_id,name,public_area,city,region_code,status",
          )
          .in("id", extraPropertyIds)
      : Promise.resolve({ data: [] }),
    allOrganizationIds.length
      ? supabase
          .from("organizations")
          .select("id,name")
          .in("id", allOrganizationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const allProperties = [
    ...propertyEntities,
    ...((extraPropertyResult.data ?? []) as Property[]),
  ];
  const allOrganizations = [
    ...organizationEntities,
    ...((allOrganizationResult.data ?? []) as Organization[]),
  ];

  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const reservationMap = new Map(
    reservations.map((reservation) => [reservation.id, reservation]),
  );
  const propertyMap = new Map(
    allProperties.map((property) => [property.id, property]),
  );
  const profileMap = new Map(
    profileEntities.map((profile) => [profile.id, profile]),
  );
  const organizationMap = new Map(
    allOrganizations.map((organization) => [
      organization.id,
      organization,
    ]),
  );
  const paymentAccountMap = new Map(
    paymentAccounts.map((account) => [account.id, account]),
  );

  const enriched = events.map((event) => {
    const categoryValue = activityCategory(
      event.event_category,
      event.action,
      event.entity_type,
    );

    const reservation =
      event.entity_type === "reservation" && event.entity_id
        ? reservationMap.get(event.entity_id)
        : undefined;

    const property =
      event.entity_type === "property" && event.entity_id
        ? propertyMap.get(event.entity_id)
        : reservation
          ? propertyMap.get(reservation.property_id)
          : undefined;

    const profile =
      event.entity_type === "profile" && event.entity_id
        ? profileMap.get(event.entity_id)
        : undefined;

    const paymentAccount =
      event.entity_type === "payment_account" && event.entity_id
        ? paymentAccountMap.get(event.entity_id)
        : undefined;

    const organization =
      event.entity_type === "organization" && event.entity_id
        ? organizationMap.get(event.entity_id)
        : reservation
          ? organizationMap.get(reservation.organization_id)
          : property
            ? organizationMap.get(property.organization_id)
            : paymentAccount
              ? organizationMap.get(paymentAccount.organization_id)
              : undefined;

    const actor = event.actor_profile_id
      ? actorMap.get(event.actor_profile_id)
      : undefined;

    const explicitEnvironment =
      event.metadata?.payment_environment === "LIVE" ||
      event.metadata?.payment_environment === "TEST"
        ? String(event.metadata.payment_environment)
        : event.metadata?.environment === "LIVE" ||
            event.metadata?.environment === "TEST"
          ? String(event.metadata.environment)
          : null;

    const environmentVisible =
      explicitEnvironment
        ? explicitEnvironment === environment
        : event.entity_type === "reservation"
          ? Boolean(reservation)
          : event.entity_type === "payment_account"
            ? Boolean(paymentAccount)
            : true;

    const title = activityTitle(event.action);
    const subject =
      reservation
        ? `${reservation.confirmation_code}${
            property?.name ? ` · ${property.name}` : ""
          }`
        : property
          ? property.name
          : profile
            ? profile.full_name || profile.email || "Profile"
            : organization
              ? organization.name
              : paymentAccount
                ? `${paymentAccount.provider} account`
                : event.entity_type.replaceAll("_", " ");

    const searchable = [
      title,
      subject,
      categoryValue,
      event.action,
      event.reason,
      event.entity_type,
      event.entity_id,
      actor?.full_name,
      actor?.email,
      reservation?.guest_name,
      reservation?.guest_email,
      reservation?.confirmation_code,
      property?.name,
      organization?.name,
      profile?.full_name,
      profile?.email,
      textMetadata(event.metadata, "reason"),
      textMetadata(event.metadata, "host_response"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      event,
      category: categoryValue,
      reservation,
      property,
      profile,
      organization,
      paymentAccount,
      actor,
      title,
      subject,
      searchable,
      environmentVisible,
    };
  });

  const filtered = enriched.filter((item) => {
    if (!item.environmentVisible) return false;

    if (
      selectedCategory !== "ALL" &&
      item.category !== selectedCategory
    ) {
      return false;
    }

    if (search && !item.searchable.includes(search)) return false;

    return true;
  });

  return (
    <AdminShell
      active="audit"
      eyebrow="Platform history"
      title="Activity log"
      context={context}
    >
      <section className="panel admin-search-page">
        <form
          className="admin-search-shell admin-property-filters"
          action="/admin/audit"
          method="get"
        >
          <input
            name="q"
            defaultValue={q}
            placeholder="Booking, guest, property, host, confirmation…"
            aria-label="Filter platform activity"
          />
          <select
            name="category"
            defaultValue={selectedCategory}
            aria-label="Activity category"
          >
            {categoryOptions.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="button button-small" type="submit">
            Filter
          </button>
        </form>

        <p className="muted">
          This is the readable operations history. Booking, cancellation,
          payment and Stripe-account events are isolated to the active
          {environment} environment. Profiles, hosts, properties, content and
          other non-transaction admin activity remain visible across the platform.
          Technical event codes stay underneath for support/debugging.
        </p>
      </section>

      <section className="panel admin-results-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Operations timeline</p>
            <h2>
              {search || selectedCategory !== "ALL"
                ? "Filtered activity"
                : "Latest platform activity"}
            </h2>
          </div>
          <span className="status-pill status-muted">
            {environment} · {filtered.length} shown
          </span>
        </div>

        {error ? (
          <div className="admin-message error">
            Platform activity could not be loaded. Apply migration 068 and
            refresh.
          </div>
        ) : null}

        {!error && filtered.length ? (
          <div className="admin-audit-list">
            {filtered.map((item) => {
              const details = detailRows(
                item.event,
                item.reservation,
                item.property,
                item.organization,
                item.paymentAccount,
              );

              const amount = item.reservation
                ? money(
                    item.reservation.guest_total_cents,
                    item.reservation.currency,
                  )
                : null;

              return (
                <details
                  className="admin-audit-row expandable"
                  key={item.event.id}
                >
                  <summary>
                    <span>
                      <span
                        className="status-pill status-muted"
                        style={{ marginBottom: 6, width: "fit-content" }}
                      >
                        {activityCategoryLabel(item.category)}
                      </span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.subject}
                        {amount && item.category !== "account"
                          ? ` · ${amount}`
                          : ""}
                      </small>
                    </span>

                    <span>
                      <b>
                        {item.actor?.full_name ||
                          item.actor?.email ||
                          "System"}
                      </b>
                      <small>{formatAdminDate(item.event.created_at)}</small>
                    </span>
                  </summary>

                  <div className="admin-audit-detail">
                    {item.event.reason ? (
                      <p>
                        <strong>What happened:</strong>{" "}
                        {item.event.reason}
                      </p>
                    ) : null}

                    {details.length ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(170px, 1fr))",
                          gap: 10,
                          margin: "12px 0",
                        }}
                      >
                        {details.map(([label, value]) => (
                          <div
                            key={`${label}-${value}`}
                            style={{
                              border: "1px solid var(--line)",
                              padding: "10px 12px",
                              borderRadius: 10,
                              background: "#fff",
                            }}
                          >
                            <small
                              style={{
                                display: "block",
                                color: "var(--muted)",
                                marginBottom: 3,
                              }}
                            >
                              {label}
                            </small>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {item.reservation ? (
                      <p>
                        <Link
                          href={`/admin/reservations/${item.reservation.id}`}
                        >
                          Open reservation →
                        </Link>
                      </p>
                    ) : item.property ? (
                      <p>
                        <Link
                          href={`/admin/properties/${item.property.id}`}
                        >
                          Open property →
                        </Link>
                      </p>
                    ) : null}

                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: "pointer" }}>
                        Technical details
                      </summary>
                      <p>
                        <strong>Event code:</strong> {item.event.action}
                      </p>
                      <p>
                        <strong>Recorded by:</strong>{" "}
                        {item.actor?.email ||
                          item.event.actor_profile_id ||
                          "System"}
                      </p>
                      {item.event.metadata &&
                      Object.keys(item.event.metadata).length ? (
                        <pre>
                          {JSON.stringify(item.event.metadata, null, 2)}
                        </pre>
                      ) : null}
                    </details>
                  </div>
                </details>
              );
            })}
          </div>
        ) : !error ? (
          <div className="panel-empty">
            <strong>No activity matches this view.</strong>
            <span>Try another category or search term.</span>
          </div>
        ) : null}
      </section>
    </AdminShell>
  );
}
