# Apply / Verify Milestone 6 — Host Organizations + Persisted Onboarding

Starting known-good checkpoint: `1aee0bb`.

Do not commit this milestone until every acceptance item below passes.

## 1. Apply files

Copy Milestone 6 over the existing repository. Preserve:

- `.git`
- `.env.local`
- `package-lock.json`

No new npm dependency is required.

## 2. Apply the migration

In the dedicated Find A Place Booking Supabase project's SQL Editor, run:

`supabase/migrations/20260906000400_host_onboarding.sql`

Run it once after migrations 001, 002 and 003 are already present.

Expected new database objects include:

- `host_onboarding_drafts`
- `partner_claims`
- `host_onboarding_status`
- `partner_claim_record_status`
- `ensure_host_onboarding()`
- `save_host_onboarding(...)`

`organizations` also gains primary-contact/business-location/onboarding-completion fields.

## 3. Local gates

```powershell
npm run typecheck
npm run build
npm run dev
```

Confirm the dev server is the current codebase and is using `http://localhost:3000` for the auth flow.

Check:

`http://localhost:3000/api/health/supabase`

Expected after migration 004: `ok: true` with `schema: host-onboarding-v1`.

## 4. Create/use a test host

Use either a clearly identified made-up test host or Fancy Hill test data. A real property is **not required** for Milestone 6.

Do not use live banking/payment data and do not publish anything.

## 5. Organization creation test

With a normal host account:

1. Open `/host` while signed in.
2. Open `/host/onboarding`.
3. Verify the page loads instead of creating a loop/error.
4. In Supabase, verify exactly one new `organizations` row exists for the host.
5. Verify `organization_members` links that profile as an ACTIVE OWNER.
6. Refresh `/host/onboarding` repeatedly and verify it does **not** create duplicate organizations/memberships.
7. Verify an append-only `host_organization.created` audit event exists.

## 6. Persistence test

Enter test values throughout onboarding. Include at least:

- host/business name;
- primary contact;
- email/phone/location;
- sample property draft name;
- address/capacity draft data;
- several amenities;
- rates/fees;
- several policies + one conditional policy detail;
- optional custom policy/amenity.

Use **Save & continue** through several steps.

Then:

1. refresh the browser;
2. verify it returns to the saved step;
3. verify saved fields/selections reload;
4. sign out;
5. sign back in;
6. reopen onboarding;
7. verify the same progress/data remains.

Photo files themselves do not persist yet. If photos were selected, their filenames can be remembered but permanent image data begins with property storage.

Also test that editing a field marks the wizard as **Unsaved changes** before save.

## 7. Admin visibility test

As the internal admin account:

1. Open `/admin/hosts`.
2. Search the test host/business name.
3. Open the host detail page.
4. Verify organization name/contact/business location are visible.
5. Verify onboarding progress/status is visible.
6. Verify Properties and Bookings/Payments still correctly say not connected rather than fabricating data.

## 8. Partner claim security test

As the test host:

1. On Partner status choose **Yes**.
2. Enter a test business/property name, owner name, membership email and/or phone.
3. Save/continue to Review.
4. Verify the host UI still reports 7% pending verification.

In Supabase/admin verify:

- organization `partner_status = PARTNER_PENDING`;
- organization `commission_tier = STANDARD_7`;
- normalized `partner_claims` row contains the identifiers;
- `/admin/partners` shows that request and those identifiers.

The host must have no path that changes their own organization to `PARTNER_5`.

As an authorized `SUPER_ADMIN`/`PARTNER_ADMIN`, approve the request and verify:

- organization becomes `VERIFIED` + `PARTNER_5`;
- partner claim becomes `VERIFIED`;
- audit entry exists;
- host reload now displays the verified 5% organization tier.

If practical, use a fresh second test organization to verify **Keep standard — 7%** produces `REJECTED` + `STANDARD_7` and an audit record. Do not damage the primary test account just to test rejection.

## 9. Finish host setup test

On Review:

- host/business name;
- primary contact;
- business email;
- partner-status answer (unless already admin-verified);
- authority checkbox

are required before **Finish host setup** marks the draft `READY_FOR_PROPERTY`.

Verify `/host` then displays that host setup is saved/ready for the property milestone.

This does **not** create or publish a property.

## 10. Security/regression tests

Confirm:

- signed-out `/host` remains protected;
- normal host cannot access `/admin`;
- admin sign-in still works;
- admin sign-out still blocks `/admin`;
- public homepage/search UI still loads;
- mobile host navigation still works;
- onboarding remains usable around 390–430px width;
- Step 5 admin routes still work;
- no payment/calendar/booking feature accidentally became live.

## 11. Checkpoint only after acceptance

```powershell
git status
git add .
git commit -m "feat: persist host organizations and onboarding"
git push origin main
git rev-parse --short HEAD
```

Record that hash in `docs/PROJECT_STATE.md` before Milestone 7 begins.
