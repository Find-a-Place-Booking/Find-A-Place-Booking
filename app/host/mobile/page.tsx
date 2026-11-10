import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import {
  refreshMobileSubscription,
  activateMobileTrial,
  manageMobileSubscription,
  resetMobileSubscriptionCheckout,
  startMobileSubscription,
} from "./actions";
import { getHostMobileOrganizations } from "@/lib/host/mobile-access";
import {
  getHostMobilePrices,
  mobileAppEnabled,
  mobileBillingEnabled,
} from "@/lib/payments/host-mobile-billing";
import styles from "./mobile.module.css";

const modeText = {
  PARTNER: "Included with partner status",
  SUBSCRIBED: "Subscription active",
  TRIAL: "Trial active",
  LOCKED: "Subscription required",
};

export default async function HostMobileAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const [organizations, params, prices] = await Promise.all([
    getHostMobileOrganizations(),
    searchParams,
    getHostMobilePrices(),
  ]);
  const launched = mobileAppEnabled();
  const subscriptionsLive = mobileBillingEnabled() && prices.length > 0;
  return (
    <DashboardShell active="Web app" title="Host web app access">
      <section className="panel">
        <p className="eyebrow dark">Find A Place Host</p>
        <h2>Your host account on the go</h2>
        <p className="muted">
          Partner accounts get the host web app included. Other hosts can use a
          30-day free trial, then choose $4.99/month or $39.99/year through
          secure Stripe billing. Your regular host dashboard and guest bookings
          stay available regardless.
        </p>
        {!launched ? (
          <div className="admin-message neutral">
            Web app access is being finalized. No subscriptions or trials can
            start yet.
          </div>
        ) : null}
        {params.billing === "success" ? (
          <div className="admin-message neutral">
            Stripe checkout returned successfully. Access appears after Stripe
            confirms the subscription. Refresh this page if needed.
          </div>
        ) : params.billing === "owner-required" ? (
          <div className="admin-message neutral">
            Only the organization owner can manage app billing. Ask the owner to
            make this change.
          </div>
        ) : params.billing === "refreshed" ? (
          <div className="admin-message neutral">
            App access has been checked against Stripe.
          </div>
        ) : params.billing === "trial-started" ? (
          <div className="admin-message success">
            Your 30-day web app trial is active.
          </div>
        ) : params.billing === "checkout-already-open" ? (
          <div className="admin-message neutral">
            You already have an open checkout for a different plan. Use the
            reset option below to change plans without creating duplicate
            checkouts.
          </div>
        ) : params.billing === "checkout-cleared" ? (
          <div className="admin-message success">
            Your earlier checkout was closed. You can choose a plan again.
          </div>
        ) : params.billing && params.billing !== "cancel" ? (
          <div className="admin-message neutral">
            Billing couldn't be completed ({params.billing.replaceAll("-", " ")}
            ). Check billing before trying another checkout.
          </div>
        ) : null}
      </section>

      {organizations.length === 0 ? (
        <section className="panel">
          <h2>No host organization yet</h2>
          <p className="muted">
            Complete host onboarding to access the host web app workspace.
          </p>
          <Link className="button" href="/host/onboarding">
            Host onboarding
          </Link>
        </section>
      ) : (
        organizations.map((org) => (
          <section className="panel" key={org.id}>
            <div className={styles.heading}>
              <div>
                <p className="eyebrow dark">
                  {org.role === "OWNER" ? "Owner" : "Manager"}
                </p>
                <h2>{org.name}</h2>
              </div>
              <span className="status-pill">{modeText[org.mode]}</span>
            </div>
            {org.mode === "PARTNER" ? (
              <p className="muted">
                Your organization's verified partner status includes host web
                app access. No subscription is required.
              </p>
            ) : org.mode === "SUBSCRIBED" ? (
              <p className="muted">
                Access is covered through{" "}
                {org.subscriptionExpiresAt
                  ? new Date(org.subscriptionExpiresAt).toLocaleDateString(
                      "en-US",
                    )
                  : "the current billing period"}
                {org.cancelAtPeriodEnd
                  ? ". Your subscription is set to end after this period."
                  : "."}
              </p>
            ) : org.mode === "TRIAL" ? (
              <p className="muted">
                Your complimentary trial runs through{" "}
                {org.trialExpiresAt
                  ? new Date(org.trialExpiresAt).toLocaleDateString("en-US")
                  : "the trial end date"}
                . Subscribe during the trial to keep its remaining free time.
                Stripe shows your first charge date; checkout keeps at least two
                free days.
              </p>
            ) : (
              <p className="muted">
                This organization isn't a verified partner and doesn't have an
                active trial or subscription.
              </p>
            )}

            <div className={styles.actions}>
              {org.hasStripeCustomer ? (
                <form action={refreshMobileSubscription}>
                  <input type="hidden" name="organizationId" value={org.id} />
                  <button className="button button-quiet" type="submit">
                    Refresh app access
                  </button>
                </form>
              ) : null}
              {org.entitled && launched ? (
                <Link
                  className="button"
                  href={`/host/mobile/workspace?organizationId=${encodeURIComponent(org.id)}`}
                >
                  Open host app
                </Link>
              ) : null}
              {org.role === "OWNER" && launched && org.canStartTrial ? (
                <form action={activateMobileTrial}>
                  <input type="hidden" name="organizationId" value={org.id} />
                  <button className="button button-quiet" type="submit">
                    Start 30-day trial
                  </button>
                </form>
              ) : null}
              {org.role === "OWNER" &&
              subscriptionsLive &&
              org.mode !== "PARTNER" &&
              org.mode !== "SUBSCRIBED"
                ? prices.map((price) => (
                    <form key={price.plan} action={startMobileSubscription}>
                      <input
                        type="hidden"
                        name="organizationId"
                        value={org.id}
                      />
                      <input type="hidden" name="plan" value={price.plan} />
                      <button className="button button-outline" type="submit">
                        Subscribe · {price.label}
                      </button>
                    </form>
                  ))
                : null}
              {org.role === "OWNER" &&
              org.hasStripeCustomer &&
              subscriptionsLive &&
              org.mode !== "SUBSCRIBED" &&
              org.mode !== "PARTNER" ? (
                <form action={resetMobileSubscriptionCheckout}>
                  <input type="hidden" name="organizationId" value={org.id} />
                  <button type="submit" className="button button-quiet">
                    Reset unfinished checkout
                  </button>
                </form>
              ) : null}
              {org.role === "OWNER" && org.hasStripeCustomer ? (
                <form action={manageMobileSubscription}>
                  <input type="hidden" name="organizationId" value={org.id} />
                  <button type="submit" className="button button-quiet">
                    Manage billing
                  </button>
                </form>
              ) : null}
            </div>
            {org.role !== "OWNER" && org.mode === "LOCKED" ? (
              <small className="muted">
                Ask the organization owner to activate web app access.
              </small>
            ) : null}
          </section>
        ))
      )}
      <section className="panel">
        <strong>Regular host portal</strong>
        <p className="muted">
          All hosts keep access to the existing website dashboard, properties,
          calendars and reservations.
        </p>
        <Link href="/host">Open host portal →</Link>
      </section>
    </DashboardShell>
  );
}
