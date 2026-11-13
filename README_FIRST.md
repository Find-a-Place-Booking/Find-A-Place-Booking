# Find A Place Booking — ResNexus Auth Diagnostics v3

**Scope:** Railway's `resnexus-worker` ONLY. No changes to Stripe, reservation logic, properties, Supabase migrations, database records or calendar mappings.

This overlay builds on the `resnexus fix` commit (`8c8dbeae659bf55dd28138b5747c96f87934fa8f`, checked November 12, 2026). It adds privacy-safe login-request telemetry and improves the wait for a slow authentication transition. It does **not** bypass CAPTCHA or two-factor authentication, claim the ResNexus login works, or invent calendar blocks.

## Install

1. Extract this ZIP into the ROOT of the local `Find-A-Place-Booking` repository, keeping its folder structure.
2. On Windows, double-click `APPLY_AUTH_DIAGNOSTICS.bat`. On Mac/Linux, run `sh APPLY_AUTH_DIAGNOSTICS.sh` (Python 3 required). **This step patches `resnexus-worker/src/resnexus.mjs`; extraction alone is not enough.**
3. Run in a terminal from repository root:
   - `cd resnexus-worker`
   - `npm run check`
   - `node --test tests/auth-observation.test.mjs`
   - `node --test tests/login-form-v2.test.mjs`
4. Commit and push. Railway automatically rebuilds the already-connected worker from GitHub `main`. Confirm the Railway deployment reaches **SUCCESS** before trying another login.

The patcher validates each current source anchor before writing anything, and is safe to rerun. If an anchor has changed, it **stops** rather than guessing or partially rewriting the file. No credentials need to be re-entered to install.

## What the next, single controlled retry should reveal

The `resnexus_browser_accounts.diagnostic` JSON will include these *categorical*, sanitized fields:

- `formSubmission`: whether our scoped form-control submission ran.
- `submissionNetwork.nonGetRequests`: number of non-GET requests sent to ResNexus during the submit.
- `submissionNetwork.nonGetResponses`: matching server responses.
- `submissionNetwork.lastSubmitResponse`: `2xx`, `3xx`, `4xx`, `5xx` or `401`/`403`/`429` (no body).
- `submissionNetwork.documentNavigations`: navigations observed during submit.
- `submissionNetwork.networkFailures` and `.javascriptErrors`: bounded counters.
- `visiblePageSignals`: classified booleans for lockout, throttling, expired password, verification hints, access denied, or generic errors, plus invalid-field/visible-alert counts.

**Privacy:** No raw response bodies, validation text, DOM HTML, URLs, query parameters, usernames, passwords, cookies, session state, or request headers are recorded. Only counts and the fixed categories above. Nothing here reuses another host's session.

## Interpreting results

- No non-GET request, no navigation, and invalid fields: likely client-side validation or form submission blocked. Inspect form-specific JS/control requirements.
- Non-GET request with `401`/`403` or generic validation error: provider rejected or blocked the auth attempt; don't assume the stored password is wrong without inspecting the permitted evidence.
- Code / two-factor / CAPTCHA: stop; the host must complete the provider's required human verification. Never circumvent it.
- Auth succeeds but calendar scraping fails: diagnose extraction/parsing separately; keep fail-closed calendar safeguards intact.

**After pushing:** Ask ChatGPT to run ONE controlled retry using the saved credentials, then check Railway logs and all ten mappings. Until all ten show a recent successful sync, verify bookings manually against ResNexus. Do not create another connection and do not disable booking safeguards.
