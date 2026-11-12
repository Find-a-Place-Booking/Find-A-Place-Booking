import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { getHostMobileOrganizations } from "@/lib/host/mobile-access";
import { mobileAppEnabled } from "@/lib/payments/host-mobile-billing";
import styles from "./mobile.module.css";

export const dynamic = "force-dynamic";

export default async function HostMobileAccessPage() {
  const organizations = await getHostMobileOrganizations();
  const available = mobileAppEnabled();

  return (
    <DashboardShell active="Web app" title="Host web app">
      <section className="panel">
        <p className="eyebrow dark">Find A Place Host</p>
        <h2>Your properties, right from your phone</h2>
        <p className="muted">
          The Find A Place Host app is free for all property owners and managers.
          Manage reservations, calendars, rates, and guest messages from your phone.
          No app subscription or paid partner status required.
        </p>
        <p className="muted">
          Guests use a separate free app, but messages sent from either app appear
          in the same private booking conversation.
        </p>
        {!available ? (
          <div className="admin-message neutral">The host app is temporarily unavailable.</div>
        ) : null}
      </section>
      {organizations.length === 0 ? (
        <section className="panel">
          <h2>Set up your host account</h2>
          <p className="muted">
            You need an active host organization to manage a property's bookings and messages.
            Browsing as a guest does not grant host access.
          </p>
          <Link className="button" href="/host/onboarding">Host setup</Link>
        </section>
      ) : (
        organizations.map((org) => (
          <section className="panel" key={org.id}>
            <div className={styles.heading}>
              <div>
                <p className="eyebrow dark">{org.role === "OWNER" ? "Owner" : "Manager"}</p>
                <h2>{org.name}</h2>
              </div>
              <span className="status-pill">Free host app</span>
            </div>
            <p className="muted">
              {org.partnerStatus === "VERIFIED"
                ? "Verified Find A Place partner · host app included for everyone."
                : "Standard host · full host app access included for free."}
            </p>
            <div className={styles.actions}>
              {available && org.entitled ? (
                <Link className="button" href={`/host/mobile/workspace?organizationId=${encodeURIComponent(org.id)}`}>
                  Open host app
                </Link>
              ) : null}
              <Link className="button button-quiet" href="/host">Full host dashboard</Link>
            </div>
          </section>
        ))
      )}
      <section className="panel">
        <h2>Traveling instead?</h2>
        <p className="muted">The free Guest app is separate and lets travelers browse stays, manage trips, and message their hosts.</p>
        <Link href="/apps/guest">Open Guest app →</Link>
      </section>
    </DashboardShell>
  );
}
