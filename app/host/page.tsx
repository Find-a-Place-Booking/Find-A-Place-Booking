import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";

export default async function HostDashboard() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  let organization: {
    id: string;
    name: string;
    partner_status: string;
    commission_tier: string;
  } | null = null;
  let draft: {
    current_step: number;
    status: string;
    updated_at: string;
  } | null = null;
  let propertyCount = 0;
  let publishedCount = 0;
  let pendingReviewCount = 0;
  let upcomingStayCount = 0;
  let bookedRevenueCents = 0;
  let calendarConnectionCount = 0;
  let paymentReady = false;

  if (profileId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", profileId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membership?.organization_id) {
      const [
        { data: organizationData },
        { data: draftData },
        { count },
        { count: liveCount },
        { count: reviewCount },
        { data: paymentAccount },
      ] = await Promise.all([
        supabase
          .from("organizations")
          .select("id,name,partner_status,commission_tier")
          .eq("id", membership.organization_id)
          .maybeSingle(),
        supabase
          .from("host_onboarding_drafts")
          .select("current_step,status,updated_at")
          .eq("organization_id", membership.organization_id)
          .maybeSingle(),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", membership.organization_id)
          .neq("status", "ARCHIVED"),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", membership.organization_id)
          .eq("status", "PUBLISHED"),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", membership.organization_id)
          .eq("status", "PENDING_REVIEW"),
        supabase
          .from("payment_accounts")
          .select("id")
          .eq("organization_id", membership.organization_id)
          .eq("provider", "STRIPE")
          .eq("status", "READY")
          .eq("charges_enabled", true)
          .limit(1)
          .maybeSingle(),
      ]);

      organization = organizationData;
      draft = draftData;
      propertyCount = count ?? 0;
      publishedCount = liveCount ?? 0;
      pendingReviewCount = reviewCount ?? 0;
      paymentReady = Boolean(paymentAccount);

      const [{ data: upcoming }, { data: organizationProperties }] =
        await Promise.all([
          supabase
            .from("reservations")
            .select("guest_total_cents")
            .eq("organization_id", membership.organization_id)
            .eq("status", "CONFIRMED")
            .gte("check_out", new Date().toISOString().slice(0, 10)),
          supabase
            .from("properties")
            .select("id")
            .eq("organization_id", membership.organization_id)
            .neq("status", "ARCHIVED"),
        ]);

      upcomingStayCount = upcoming?.length ?? 0;
      bookedRevenueCents = (upcoming ?? []).reduce(
        (sum, reservation) =>
          sum + Number(reservation.guest_total_cents ?? 0),
        0,
      );

      const propertyIds = (organizationProperties ?? []).map(
        (property) => property.id,
      );

      if (propertyIds.length) {
        const { data: units } = await supabase
          .from("property_units")
          .select("id")
          .in("property_id", propertyIds);
        const unitIds = (units ?? []).map((unit) => unit.id);

        if (unitIds.length) {
          const { count: connectionCount } = await supabase
            .from("calendar_connections")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true)
            .in("unit_id", unitIds);
          calendarConnectionCount = connectionCount ?? 0;
        }
      }
    }
  }

  const progress = draft
    ? Math.round(((Number(draft.current_step ?? 0) + 1) / 10) * 100)
    : 0;
  const ready = draft?.status === "READY_FOR_PROPERTY";
  const isPartner =
    organization?.partner_status === "VERIFIED" &&
    organization?.commission_tier === "PARTNER_5";
  const commissionRate = isPartner ? "5%" : "7%";

  return (
    <DashboardShell active="Overview" title="Host dashboard">
      {isPartner ? (
        <div className="host-alert">
          <div>
            <span>✓</span>
            <p>
              <strong>Find A Place Partner</strong>
              {" "}Your account has the partner commission rate.
            </p>
          </div>
          <strong>{commissionRate}</strong>
        </div>
      ) : null}

      <div className="host-alert">
        <div>
          <span>
            {propertyCount
              ? "✓"
              : ready
                ? "✓"
                : organization
                  ? Math.max(1, Math.ceil(progress / 25))
                  : "1"}
          </span>
          <p>
            <strong>
              {propertyCount
                ? `${propertyCount} property ${
                    propertyCount === 1
                      ? "listing is"
                      : "listings are"
                  } connected.`
                : ready
                  ? "Host setup is complete."
                  : organization
                    ? `Continue setting up ${organization.name}.`
                    : "Finish your host profile."}
            </strong>
            {propertyCount
              ? " Published listings can sync calendars, receive bookings and feed reservation details into this dashboard."
              : ready
                ? " Your account is ready for you to add your first property."
                : organization
                  ? ` You’re ${progress}% through the guided setup.`
                  : " Add your hosting or business details first, then build your property listing."}
          </p>
        </div>
        <Link
          href={
            propertyCount || ready
              ? "/host/properties"
              : "/host/onboarding"
          }
        >
          {propertyCount
            ? "Open properties →"
            : ready
              ? "Add property →"
              : organization
                ? "Continue setup →"
                : "Start setup →"}
        </Link>
      </div>

      <div className="dash-grid metrics">
        <div>
          <span>Upcoming booking value</span>
          <strong>
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(bookedRevenueCents / 100)}
          </strong>
          <small>Confirmed future stays</small>
        </div>

        <div>
          <span>Upcoming stays</span>
          <strong>{upcomingStayCount}</strong>
          <small>
            {upcomingStayCount
              ? "Confirmed reservations"
              : "No upcoming reservations"}
          </small>
        </div>

        <div>
          <span>Properties</span>
          <strong>{propertyCount}</strong>
          <small>
            {publishedCount
              ? `${publishedCount} live`
              : pendingReviewCount
                ? `${pendingReviewCount} in review`
                : propertyCount
                  ? "Draft / not published"
                  : ready
                    ? "Ready to add first property"
                    : "Complete host setup first"}
          </small>
        </div>

        <div>
          <span>Find A Place fee</span>
          <strong>{commissionRate}</strong>
          <small>
            {isPartner
              ? "Partner rate"
              : "Standard commission"}
          </small>
        </div>
      </div>

      <div className="dash-two">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Reservations</p>
              <h2>Upcoming stays</h2>
            </div>
            <Link href="/host/reservations">View reservations</Link>
          </div>
          <div className="panel-empty">
            <strong>
              {upcomingStayCount
                ? `${upcomingStayCount} confirmed upcoming ${
                    upcomingStayCount === 1 ? "stay" : "stays"
                  }.`
                : "No upcoming reservations."}
            </strong>
            <span>
              {upcomingStayCount
                ? "Open reservations for guest contact, messages, cancellation requests and payment details."
                : "New confirmed Find A Place bookings will appear here automatically."}
            </span>
          </div>
        </section>

        <section className="panel occupancy-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Availability</p>
              <h2>Calendar</h2>
            </div>
            <Link href="/host/calendar">Open calendar</Link>
          </div>
          <div className="panel-empty">
            <strong>
              {calendarConnectionCount
                ? `${calendarConnectionCount} external ${
                    calendarConnectionCount === 1
                      ? "calendar is"
                      : "calendars are"
                  } connected.`
                : "No external calendar connected."}
            </strong>
            <span>
              {calendarConnectionCount
                ? "Connected feeds sync automatically and are checked again before a booking is confirmed."
                : "Connect Airbnb, Vrbo or another iCal feed from the property calendar."}
            </span>
          </div>
        </section>
      </div>

      <div className="dash-two">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Account checklist</p>
              <h2>Get ready for bookings</h2>
            </div>
            <span
              className={`status-pill ${
                ready ? "" : "status-muted"
              }`}
            >
              {ready
                ? "Host setup saved"
                : organization
                  ? "In progress"
                  : "Not started"}
            </span>
          </div>

          <div className="setup-list">
            <div>
              <b>{organization ? "✓" : "1"}</b>
              <span>
                <strong>Host profile</strong>
                <small>
                  {organization
                    ? organization.name
                    : "Add the person or business managing the stays"}
                </small>
              </span>
            </div>

            <div>
              <b>{ready ? "✓" : "2"}</b>
              <span>
                <strong>Property setup details</strong>
                <small>
                  {ready
                    ? "Saved and ready for property creation"
                    : "Add amenities, rates, policies and booking details"}
                </small>
              </span>
            </div>

            <div>
              <b>{propertyCount ? "✓" : "3"}</b>
              <span>
                <strong>Property listing</strong>
                <small>
                  {propertyCount
                    ? `${propertyCount} property listing${
                        propertyCount === 1 ? "" : "s"
                      } saved`
                    : "Create your listing from the setup details"}
                </small>
              </span>
            </div>

            <div>
              <b>{calendarConnectionCount ? "✓" : "4"}</b>
              <span>
                <strong>Calendar connection</strong>
                <small>
                  Connect external calendars used by the property
                </small>
              </span>
            </div>

            <div>
              <b>{paymentReady ? "✓" : "5"}</b>
              <span>
                <strong>Payment account</strong>
                <small>
                  {paymentReady
                    ? "Stripe direct payments are ready"
                    : "Connect Stripe so guest payments go to your account"}
                </small>
              </span>
            </div>
          </div>
        </section>

        <section className="panel performance host-promotion-panel">
          <p className="eyebrow dark">Promotion &amp; reach</p>
          <h2>Want help getting in front of more travelers?</h2>
          <div className="panel-empty">
            <strong>
              Ask about a custom Find A Place advertising plan.
            </strong>
            <span>
              Optional social media and travel-community promotion can
              be built around your property, location, season or
              campaign goals. This is separate from the booking
              platform commission.
            </span>
            <div className="host-promotion-actions">
              <Link
                className="button button-small"
                href="/contact#advertising"
              >
                Ask about advertising
              </Link>
              <a
                href="https://www.findaplacear.com"
                target="_blank"
                rel="noreferrer"
              >
                See the Find A Place network ↗
              </a>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
