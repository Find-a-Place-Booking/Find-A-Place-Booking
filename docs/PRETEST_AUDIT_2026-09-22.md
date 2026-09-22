# Find A Place Booking pre-test audit — 2026-09-22

Baseline: GitHub `main` at `b402edf97cbf68876e0f52e02350d823c22fec91` (2026-09-22 00:43 -0500). Changes in this audit are on `codex/pretest-audit` and have not been applied to the live database.

## Flow map

| UI entry | Server path | Database/processor path | Other effects |
| --- | --- | --- | --- |
| Search/property/calendar | `/stays`, `/stays/[slug]`, `/api/booking/availability` | Published listing reads, active `availability_blocks` | Dates carried to checkout |
| Checkout | `/api/booking/hold` | Turnstile, refresh inbound iCal, `create_guest_taxed_reservation_hold` (availability lock, pricing/tax snapshot, internal hold) | Signed guest checkout token |
| Verification/policies | `/api/booking/verification/*`, `/api/booking/policies/*` | Email/Identity state and policy review/acceptance | Guest verification email |
| Payment | `/api/booking/payment-intent` | `claim_stripe_payment_attempt`; connected-account direct PaymentIntent with application fee | Host pays Stripe processing; 5%/7% commission on lodging plus retained marketplace tax |
| Confirmation | `/api/stripe/webhook` | `confirm_reservation_payment` updates payment, reservation, availability, tax and financial ledgers | Booking and payment emails |
| Guest trip | `/api/trip/{lookup,messages,change-request,cancellation}` | Signed reservation access; message and request rows | Host emails |
| Host decision | `app/host/reservations/detail-actions.ts` | Change RPC; no-refund cancellation RPC; full refund request + connected-account Stripe refund | Guest emails, application-fee refund |
| Calendars | host calendar actions, `/api/cron/calendar-sync`, `/calendar/[token]` | Service iCal sync and export-token RPC | External feed fetch/export |

## Confirmed fixes in this branch

1. **Critical — no-refund cancellation could partially commit.** Migration 057 moves request completion, reservation cancellation, block release, and event insertion into one transaction; rejects no-refund cancellation 14+ calendar days ahead. Host UI now exposes the choice inside the cutoff. Migration 060 uses the property's local calendar day for this rule.
2. **Critical — late paid hold could confirm over newly blocked dates.** Migration 058 requires an unexpired, matching internal hold and rejects overlapping active blocks before confirmation. A charged but rejected reservation now needs manual Stripe reconciliation; do not interpret webhook retries as an automatic refund.
3. **High — direct payment webhook race.** PaymentIntent route conditionally updates payments and reservations so a faster success webhook cannot be overwritten by `REQUIRES_ACTION`/`PAYMENT_PENDING`.
4. **High — asynchronous guest refund omitted the platform fee refund.** Refund webhook now attempts the partial application-fee refund using the same Stripe idempotency key as the synchronous host/admin path, records success or failure, and retries on webhook delivery failure. Migration 059 keeps completed refund states from being downgraded by out-of-order events. Admin refunds now record application-fee status and keep guest refund success separate from a pending fee return.
5. **High — Stripe failed/refund events lacked connected merchant matching.** Webhook verifies the event account, environment, local payment/refund, and external payment/refund identifier before mutation. Success events additionally check the amount, currency, application fee and payment model snapshot.
6. **High — change requests could add disallowed pets.** Migration 060 reapplies the same pet policy validation used at initial booking and checks changed dates against property-local time.
7. **High — 14-day cutoff used the database server date.** Migration 060 calculates eligibility using the property's IANA timezone; the host UI uses the same calendar-day boundary.
8. **High — fee refund failures were hidden.** Host and admin reservation details now show the application-fee refund amount/status and flag failed reconciliation.
9. **Cleanup — misleading UI.** Published listing editor and admin host detail no longer claim booking records are disconnected.

## Remaining risks and limits

- **Deployment blocker:** migrations 057–060 are new and have not been applied to Supabase. No live schema, applied migration history, RLS catalog, Stripe webhook configuration, or production environment values were available for comparison. Earlier migrations may differ from deployed state. Apply in order and inspect schema diff before tests.
- **Charged/expired hold:** the new guard prevents an overlapping confirmation, but a Stripe charge that arrives after its hold has been released is left for manual reconciliation. Add an explicit charged-but-unconfirmed operations queue and automated refund decision before public launch. Existing lock order also differs between hold creation (unit then reservation) and payment confirmation (reservation then unit), so concurrent expiry/confirmation can deadlock and require webhook retry.
- **Refund reconciliation:** if a guest refund succeeds but its partial application-fee refund cannot be created, the guest and reservation can show refunded/cancelled while `application_fee_refund_status=FAILED`. The tax ledger reverses the guest tax on refund; finance must reconcile the still-held application fee. No automatic cross-system transaction can make the two Stripe operations atomic.
- **Cancellation approval:** after a full-refund request is created, host action updates cancellation request metadata separately and does not check the update result. A webhook can complete the refund first; inspect request status and fee status after each test. The no-refund path is now atomic. A failed/ambiguous Stripe call may leave a `PENDING` refund reservation with no automatic retry action; reconcile against Stripe before attempting another refund.
- **Calendar import:** timed ICS values are reduced to date text without applying `TZID` or UTC conversion. Recurring RRULE events fail closed, and an unexpectedly empty feed requires a second sync at least five minutes later. A connection can thus block checkout until repaired. Test actual OwnerRez/ResNexus feeds and midnight boundaries.
- **Guest authorization:** the trip token is a deterministic HMAC of the reservation UUID, remains usable after cancellation, and is embedded in URLs/emails. It has no per-trip expiration or rotation; treat the URL as a bearer credential. Confirmation code plus booking email can mint it through trip lookup. Consider expiring scoped tokens and rate limiting lookup before broad public rollout.
- **Checkout hold cleanup:** expired holds are released when a new hold is attempted for that unit; there is no dedicated expiration cron. Availability read ignores expired internal holds, but stale rows persist until another hold.
- **Onboarding:** the 11-step wizard persists a host draft and photo filenames; photos, actual listing, rates, calendar feed, and Stripe are completed in subsequent screens. Test the handoff; the wizard itself does not upload photos or create a bookable property.
- **Tax/policy:** commission versus retained marketplace tax is separated in the direct-charge snapshot/ledger. Effective state/local rates and Hot Springs assignments cannot be validated against the live Supabase tax tables here. Migration 060 now uses the property-local date for the 14-day rule; verify its behavior around midnight with Renea. Applied change requests deliberately leave the payment snapshot unchanged even if dates or pet counts change, so the host must consciously accept the unchanged charge.
- **iCal fetch security:** hostname/IP checks happen before `fetch`, but the actual connection is not pinned to those resolved addresses; DNS rebinding remains a risk for an untrusted feed URL.
- **Notifications:** email delivery is persisted and retried separately, so email failures do not roll back bookings. Confirm sender/domain/cron and failed-delivery handling; a missing Resend key skips delivery.
- **Legacy/UX:** `/api/cron/payouts` is intentionally disabled for direct charges; `/host/payouts` redirects to payments. Check checkout-disabled messaging and manual response screens in browser, including keyboard/mobile and failed navigation. No authenticated browser session was available in this audit.

## Validation

- `npm ci`, `npm run typecheck`, and `npm run build` passed on the baseline; rerun on final branch before merge.
- `npm audit --json`: zero reported vulnerabilities against the current registry at audit time.
- `node scripts/check-pilot-readiness.mjs` found two stale strings; corrected both.
- Inventoried all 43 baseline migrations in order and identified 34 redefined function names; inspected effective definitions and relevant predecessors for booking, direct charge, refund, change, calendar, tax, permissions and notification flows. Four forward migrations result from this audit. This was a focused source audit, not a line-by-line execution of every migration or a browser test of every page. PostgreSQL migrations were **not executed against a database**; build success does not validate PL/pgSQL or deployed grants.

## Renea test sequence (Stripe TEST only)

1. Confirm deployment commit, applied migrations through 060, test-mode keys, connected merchant `READY`, connected-account webhook signing, Turnstile, Resend sender, cron secret and jobs, and correct tax profile/rules. Confirm no real customer data will be changed.
2. Sign in as host; inspect onboarding draft persistence and agreement, partner claim stays pending, create/publish a listing, upload policy PDF and photos, configure pets/rates/taxes and connect test Stripe.
3. Add a manual calendar block, then import a known test ICS feed. Test duplicate event, changed date, cancelled/missing event, export token, and a second calendar source. Verify cancelled reservation disappears from exported unavailability.
4. From guest search select available dates and guest/pet counts; verify date search, blocked dates, itemized lodging/fees/pets/taxes, and exact total. Verify policies must be opened/accepted, email and Identity gates, and phone entry.
5. Create one test hold; abandon it, check expiry and release upon another hold. Attempt the same dates in two sessions. Do not run a real charge.
6. Make **one Stripe test charge** on the host's connected account. Check PaymentIntent account/application fee, Stripe processing charged to host, reservation confirmation and code, one calendar block, tax and financial ledger, guest/host emails, and My Trip lookup. Replay webhook in test mode and verify no duplicate ledger/email.
7. Send guest chat, change request and cancellation request separately. Host applies an exact date/count change; verify old dates release, new dates block, overlap rejection, unchanged payment total, status, messages and email.
8. On a disposable second test booking 14+ days out, approve a full refund and verify guest refund, full eligible commission plus tax application-fee refund, cancellation `COMPLETED`, history, ledger reversal, released block and emails.
9. On another disposable test booking inside 14 days, test full refund (commission retained, tax returned), then separately test no-refund cancellation. Test decline path on another request. Check Stripe, admin and host reporting after each.
10. Test a failed card/abandoned payment, webhook retries, refund event delivered late, missing email delivery, guest access after cancellation, host/admin role separation, and mobile browser flows. Stop and reconcile any charged-but-unconfirmed or fee-refund-failed row before continuing.
