# Find A Place web apps

Extract this overlay over the current repository and push through the usual deployment. It replaces the prior mobile-source package for the web-app scope. No Android, iPhone, Capacitor or notification-provider setup is needed for these browser apps.

## Access

| Experience | Price | Access |
| --- | --- | --- |
| Guest app | Free | Browse, save, book, trip lookup, messages, booking requests and reviews. No host management controls. |
| Standard host app | $4.99/month or $39.99/year | Active host organization membership plus subscription; a one-time, explicitly started 30-day free trial is available. |
| Verified partner host app | Free | Active host organization membership and VERIFIED partner status set by an authorized admin. |

The paid plan is organization-wide. Pending partner claims do not grant free access. Host authorization is enforced on the server for reads and writes; a guest URL, saved trip, local setting or modified client cannot grant host privileges. A genuine subscribed/verified host can also browse the free guest app, but that guest interface contains no host controls.

The existing ordinary host portal remains available for onboarding and existing website management. This paid plan controls the dedicated web app, consistent with the earlier host-app model.

## Pages after deployment

- /apps — guest/host app entry page.
- /apps/guest — free guest app.
- /host/mobile — host app access, trial, subscription and billing.
- /host/mobile/workspace — interactive host app; no longer a list of shortcuts.
- /admin/host-app — search hosts, verify partners, remove verification and review app access.

The admin and host menus include links to their app pages. Both apps can be added to a phone's home screen; home-screen installation never grants permissions. Internet access is required. No service worker caches private host or guest records.

## Already configured in the connected live account

- Stripe product: prod_VbFkoh8nCDjopb (Find A Place Host Web App).
- Monthly: price_1Ua3EvC2mWQkETD8Do4ei9cR — USD 499 cents/month, lookup key fap_host_webapp_monthly_v1.
- Annual: price_1Ua3FhC2mWQkETD8AtP2qvQ3 — USD 3999 cents/year, lookup key fap_host_webapp_yearly_v1.
- Billing portal: bpc_1Ua3L7C2mWQkETD8ajjIp9DF; invoices, payment-method updates and cancellation at period end.
- Existing platform webhook subscription expanded to include Checkout, subscription lifecycle, paid/failed invoices, refund/dispute/fraud events while preserving all prior booking events. The existing webhook URL and signing secret are unchanged.
- Database admin_set_host_webapp_partner RPC installed and checked. Only SUPER_ADMIN/PARTNER_ADMIN can use it. Guests cannot execute it. It changes partner verification and writes an audit entry; booking commission is not changed.

No customer was subscribed or charged. No host's current partner status was changed during setup.

## Deployment settings

Uses the site's existing Supabase server configuration, STRIPE_SECRET_KEY and existing STRIPE_WEBHOOK_SECRET/STRIPE_CONNECT_WEBHOOK_SECRET. No native keys or new webhook signing secret is needed for the main /api/stripe/webhook handler.

The source resolves the two prices by their Stripe lookup keys automatically. Existing STRIPE_HOST_MOBILE_MONTHLY_PRICE_ID and STRIPE_HOST_MOBILE_YEARLY_PRICE_ID overrides, if present, must use the matching IDs above; mismatched amounts/currencies/intervals are rejected.

The web app and billing are enabled by default when the existing Stripe server key is present. If earlier preparation explicitly set HOST_MOBILE_APP_ENABLED=false or HOST_MOBILE_BILLING_ENABLED=false in the deployment environment, set the corresponding flag to true to launch. An explicit false remains a deliberate pause switch. Manage billing remains available for existing customers when new signups are paused.

The current Vercel connection exposed no matching Find A Place project, so no environment variables or deployment were changed in this turn. This overlay must be deployed before the new pages or subscription-event handler exist on the website. Once deployed, verify these pages and complete a controlled subscription checkout/cancel test before promotion to guests and hosts. Live payment lifecycle testing has not been performed.

## Database source

The package contains the additive host-app migration sources, including the newly installed admin verification RPC, for repository history and other environments. The production host_mobile_access table, Stripe columns and trial function already existed. Compare migration history before applying historical files; do not rerun old functions out of order. This web package does not need the native push tables or migration.

## Verification — corrected QA overlay (2026-11-10)

- Fresh dependency installation and repository TypeScript check passed.
- 72 automated security, billing, API and regression tests passed.
- Seven DOM integration scenario groups passed for guest and host flows, failed calendar loads, reservation switching, pending requests, late responses and revoked access.
- Full Next.js 16.4.6 production build passed, including 106 generated pages, using isolated Supabase fixtures. This verifies compilation and rendering, not production database behavior.
- Full dependency audit reported zero known vulnerabilities at the time of testing.
- Actual browser/device screenshots and live payment lifecycle testing remain unperformed. Deploy and check the real environment before promoting the apps.

Developer checks: `npm ci`, `npm run typecheck`, `npm run qa:webapp`, `npm run qa:build`, `npm audit`. The `qa:build` command deliberately uses dummy database fixtures and blocks outbound access; never enable its fixture preload in deployment. Normal deployment continues to use `npm run build` with real environment configuration.

See `docs/handoff/WEBAPP_QA_REPORT.md` for findings, fixes and remaining verification limits. This corrected overlay replaces the earlier web-app ZIP.

## Operational details

The app uses same-origin browser session cookies. Cookie-authenticated writes require the site's own Origin; invalid Bearer tokens never fall back to cookies. Calendar/rate writes use user-scoped Supabase clients and existing canonical RPCs. Trips use existing guest booking-access tokens and the established request/review notification logic.

Stripe subscriptions are separate from lodging payments. The app fee does not alter booking commission or host lodging-tax responsibilities. Subscription sales-tax applicability is separate from lodging tax; prices use exclusive tax behavior, and automatic tax collection has not been enabled without registration review.

Verified partner conversion stops future app renewals, with an hourly reconciliation task as a retry path. Already paid periods are not automatically refunded. Refund/dispute/fraud signals for app subscriptions appear as billing-review warnings on the admin app-access page; admins decide any refund/cancellation response in Stripe.
