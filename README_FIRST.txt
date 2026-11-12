# Find A Place — ResNexus Worker Login Diagnosis Repair

Base: GitHub main commit 328a99516cc67fc6a70a8b7fc1f6804d6907b381

This package includes the complete NEW login-diagnostics module and its tests,
plus a small standard Git patch for two EXISTING files. Unlike normal overlays,
the original 71KB worker is not bundled because direct GitHub writes were rejected
(403) and its full source could not be exported to the local runtime. No passwords,
cookies, tokens, or calendar records are included.

1. Extract this ZIP INTO the root of the Find-A-Place-Booking repository.
2. From the repository root run:

   git apply --check FAP_RESNEXUS_LOGIN_REPAIR.patch
   git apply FAP_RESNEXUS_LOGIN_REPAIR.patch

3. Validate:

   node --test resnexus-worker/tests/login-diagnostics.test.mjs
   npm --prefix resnexus-worker run check

4. Commit and push to GitHub. Redeploy the ResNexus Railway worker from the same
   commit (the web frontend does not deploy the standalone worker).
5. Confirm Railway worker logs and health, then only after deployment trigger
   Retry now on the ORIGINAL ResNexus connection with ten mapped properties.
6. Verify the account status CONNECTED, the ten resource mappings and that actual
   booked/blocked nights match ResNexus before treating availability as reliable.

Changes:
- Waits for post-login page transition (up to 6sec) instead of 1.5sec.
- Does not call a login failure bad credentials based on generic page text.
- Only explicit credential-specific errors produce CREDENTIALS_REJECTED.
- Unconfirmed logins are LOGIN_REQUIRED with a safe, content-free diagnostic.
- Hides disabled unmapped duplicate connection from the host-facing list and
  clarifies that adding a new login is NOT how to reconnect an existing one.
- Keeps existing booking blocks, mappings, reservations, encryption and session
  boundaries intact. No database migration or payment changes.

IMPORTANT: The patch improves diagnosis and fixes potential false positives.
It does NOT guarantee ResNexus accepts the login, nor have worker runtime logs
been checked. Railway was not connected when this package was created.
