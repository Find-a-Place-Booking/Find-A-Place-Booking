# PROJECT_STATE top-section update for 10A.1

`docs/PROJECT_STATE.md` on baseline `ecfca766` still has the older 9B checkpoint at the top. After this hardening pass is locally accepted and pushed, update its top/current-milestone section to the **new pushed 10A.1 hash**, with these facts:

- 9B / 9B.1 calendar foundation accepted.
- `ecfca766` is the Milestone 10A reservation/payment-foundation baseline.
- migration 016 created reservation snapshots, canonical holds, promo reservation boundary, payment-account routing, payment/refund state, processor event storage and append-only financial ledger.
- migration 017 hardened composite ownership, processor assignment consistency, immutable reservation commercial snapshots, resolver authorization and development-test RPC gating.
- live money remains disabled; Stripe/Square adapters still fail closed.
- next milestone is the planned final UI/UX cleanup pass before Vercel staging.

Do not record the 10A.1 hash in PROJECT_STATE until that commit actually exists.
