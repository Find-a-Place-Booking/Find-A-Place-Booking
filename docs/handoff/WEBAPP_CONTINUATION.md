# Web-app continuation

User clarified the immediate deliverable is browser apps, not signed Android/iPhone releases.

Implemented /apps/guest and a genuine interactive /host/mobile/workspace. Guest UI has no host controls. Both reuse the previous mobile-specific screens through web-only components; no Capacitor dependency is part of the browser entry points. Browser APIs authenticate host cookies server-side, verify organization membership and recheck partner/trial/subscription access. Added CSRF protection for cookie mutations. Partner verification is controlled by a role-checked, audited database function and /admin/host-app.

Changed the intended cheap price to $4.99/month or $39.99/year and provisioned these prices in the connected live Find A Place Stripe account. Created a billing portal configuration. Expanded existing platform webhook event subscriptions, preserving old events and its signing secret. Added a shared canonical subscription-event reconciler to the existing main webhook source. The source is not deployed yet.

Applied only the new admin verification RPC to production; no host partner records were altered and no customer was subscribed/charged. Read-only checks confirmed the host-access table/Stripe columns/canonical calendar and pricing functions exist. Confirmed guest role cannot execute the verification RPC and ordinary organizations RLS exposes SELECT only.

Validation after QA corrections: fresh install, TypeScript, 72 automated tests and seven DOM flow groups passed. Full Next.js 16.4.6 production build completed (106 pages) using isolated database fixtures. Dependency audit reported zero known vulnerabilities. Real browser/device, deployed database and live subscription lifecycle checks remain pending. See WEBAPP_QA_REPORT.md. Corrected source in this package supersedes the earlier web overlay.

The earlier native package remains historical. The new web overlay omits native projects and push setup. Preserve existing site header fixes; this change only adds app links to current admin/host navigation.

See README_WEB_APPS.md for exact deployed routes, Stripe IDs, launch flags and remaining deployment checks. Do not call the new web pages live until the overlay is pushed/deployed and checked on the production URL.
