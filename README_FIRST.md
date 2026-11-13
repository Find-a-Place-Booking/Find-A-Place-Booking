# Find A Place Booking — ResNexus worker login repair v2

## What this repairs

1. Targets the **visible password field's own form** to find the login/email field and submit button. No site-wide `button[type=submit]` selection, which can accidentally click an unrelated form.
2. When the calendar redirects to login, clears stale browser cookies and opens the canonical ResNexus login page with fresh session/anti-forgery cookies, then submits **once** using the already stored credentials. Verification-code sessions are not reset.
3. Stops capturing the browser state of an ordinary failed login as if it were valid, and discards rejected-login cookies after the safe failure RPC. Keeps verification-challenge cookies for a host-entered code.
4. Safely reports `LOGIN_FORM_CHANGED` if the form is missing or ambiguous, rather than blindly filling/submitting some other page fields.
5. Fixes host credential saving so a password with leading/trailing spaces is not silently trimmed on input (does not change existing stored passwords).

## IMPORTANT result before this patch

On November 12, 2026 (6:54 PM Central), a controlled production retry was run after clearing Renea's old browser session; the saved username/password were still explicitly rejected by ResNexus. Thus the patch is a **login-submission safety and diagnostic correction**, not proof that Renea's credentials are valid. A genuine invalid username/password or provider restriction cannot be repaired by copying encrypted values between connection records. Do not assume calendar sync is restored until a new worker SUCCESS run is confirmed.

## Installation (Windows)

1. Extract this ZIP at the ROOT of `Find-A-Place-Booking`, not inside `resnexus-worker`.
2. Double-click **APPLY_RESNEXUS_WORKER_FIX.bat** (requires Python 3). This modifies only:
   - `resnexus-worker/src/resnexus.mjs`
   - `resnexus-worker/src/index.mjs`
   - `app/host/integrations/resnexus/actions.ts`
   It also installs `resnexus-worker/src/login-form-v2.mjs` and a test file.
3. The updater checks source anchors *before writing anything*. If the source changed, it stops without modifications. Backups named `*.before-resnexus-v2.bak` are written locally; **do not commit the `.bak` files**.
4. Run:
   - `cd resnexus-worker`
   - `npm run check`
   - `node --test tests/login-form-v2.test.mjs`
5. Commit the two edited `.mjs` files, `app/host/integrations/resnexus/actions.ts`, plus `src/login-form-v2.mjs` and the test. Push to GitHub `main`. Railway is already connected to this repository and auto-deploys on push.
6. Verify Railway deployment status SUCCESS, then run only ONE controlled retry of Renea's existing 10-mapping connection. Watch Supabase `resnexus_account_runs` and `calendar_connections` before trusting availability.

## Safety

- No ResNexus username/password, encryption keys, browser cookies, guest information, or login forms included in ZIP.
- No calendar mappings, imported blocks, reservations, fees, or database functions changed by the overlay. After an explicit rejection, the worker clears only the failed session cookies in the account row, and does not change the encrypted login or password.
- No CAPTCHA bypass, session hijacking, or multi-password retry.
- If the provider explicitly rejects a correctly submitted login again, the next step is provider-side authentication validation with Renea/ResNexus; another duplicate Find A Place connection will not help.
- **Important:** while the 10 calendars report errors, compare availability manually against ResNexus before accepting a booking.
