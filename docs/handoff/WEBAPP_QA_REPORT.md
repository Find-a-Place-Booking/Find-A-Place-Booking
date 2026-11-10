# Web-app QA report — 2026-11-10

Audited the exact previously delivered web overlay against repository baseline ec1c217 in a separate checkout. This corrected package supersedes that overlay. No deployment, customer charge, host status change or live database mutation was performed during this QA pass.

## Findings fixed

| Area | Correction |
| --- | --- |
| Checkout pricing | Reused Stripe sessions must match the current price and quantity; stale sessions expire. |
| Trial conversion | Checkout preserves remaining trial time, with at least two days when converting near trial end. |
| Payment reconciliation | Added explicit access refresh; checked replacement subscriptions and guarded concurrent observations to prevent older results restoring canceled access. |
| Partner billing | Removed Stripe writes from read paths; bounded cancellation reconciliation and handled retry/update errors. |
| Authorization | Membership, organization and entitlement checks remain server-side. Workspace clears private data when access is revoked. Owner-only billing denial is handled clearly. |
| Calendar | Requests scope to the selected active unit. Failed/truncated loads fail closed, hide availability and disable writes. Stale responses cannot overwrite newer selection. |
| Guest trips | Reservation switches clear drafts and reject late results. Pending requests prevent duplicate submissions. Review availability follows booking state and checkout. |
| Messaging | Added narrowly scoped read receipts after host authorization because authenticated UPDATE RLS was absent. Expired holds cannot open chat. |
| Request validation | Bounded streamed JSON reads; malformed bodies and invalid field types return controlled errors. Invalid search dates are rejected. |
| Rates | Validated money/integer bounds and preserved optional included-guests semantics. Saving locks controls and failed loads can retry. |
| Navigation and errors | Late property responses cannot reopen over My Trip; unexpected HTML API responses fail clearly; host fallback and retry screens added. |
| Dependencies | Updated compatible Next.js and affected transitive dependencies; updated development esbuild. Full audit now reports zero known vulnerabilities. |

## Final verification

| Check | Result |
| --- | --- |
| Fresh npm ci --ignore-scripts | Passed |
| npm run typecheck | Passed |
| Node security/billing/API regressions | 72 passed, zero failed/skipped |
| DOM integration flow groups | Seven passed |
| Full production build through npm run qa:build | Passed; 106 generated pages |
| Full npm audit | Zero known vulnerabilities at test time |
| ZIP CRC and source SHA-256 manifest | Verified during packaging |

Build fixtures contain no real credentials. They provide isolated empty public database responses and block other outbound requests/mutations. The fixture build checks the complete compiler/prerender path; it does not prove real production data or credentials work. Normal production builds must use the existing real environment with npm run build. Do not deploy the fixture preload or enable its environment flag.

Read-only connected-account checks confirmed the intended live USD $4.99/month and $39.99/year prices and enabled platform subscription webhook events. No subscription purchase, renewal, cancellation or refund was performed during QA.

## Remaining deployment verification

After applying and deploying this overlay, check real guest browse/map/checkout/trip access, host login and trial, admin partner verification, subscription checkout and cancellation, webhook delivery, and access changes in the deployed environment. Use controlled accounts and Stripe test mode for transactional testing where possible. Real browser layout, phone installation and device behavior have not been visually verified in this runtime. Existing ordinary host-site management remains available under the intended earlier access model; only the dedicated host app is subscription/partner gated.

This report records the checks actually completed. It is not a claim that all possible defects have been eliminated.
