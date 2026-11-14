# Find A Place Booking — ResNexus browser login worker repair

Target: GitHub repository `Find-a-Place-Booking/Find-A-Place-Booking`, Railway `resnexus-worker` service (root directory `/resnexus-worker`).
Prepared against GitHub main commit `292d65151689ebd37ede8dcd4234245c7a194e35`, original login helper blob SHA `bbabfcbfd725b884b1c842a23d1500c30f82cd9c`.

## Apply (direct overlay; no installer)

1. Back up/commit any local changes. Open your Find-A-Place-Booking repository folder.
2. Extract this ZIP **into the repository root**, merging its `resnexus-worker` folder and replacing the two files below.
3. Run from the repository root:

   cd resnexus-worker
   node --check src/login-form-v2.mjs
   node --test tests/login-form-v2.test.mjs
   npm run check

4. Review `git diff` (the worker login helper and its tests only), then commit/push to **main**.
5. Wait for Railway service `Find-A-Place-Booking` in project `courteous-motivation` to show a successful new deployment using the new commit. Check auth failures before manually requesting **one** retry of the saved account; never run repeated blind password attempts.

## What is repaired

- Identifies `input[type=button]`, `button[type=button]`, `input[type=image]`, accessible clickable elements, JavaScript-backed login links, and normal submit controls.
- Chooses exactly ONE safe action from the same visible credential form. If the login button is a sibling, searches ONLY the form's immediate wrapper and requires one explicitly labeled action.
- Sends proper input/change/blur events before submitting. No raw HTTP credential submission, form bypasses, CAPTCHA workarounds, or duplicate clicks.
- If a login fails, the existing worker diagnostic now records a safe `formSubmission` category such as `login_form_submitted_via_named_login_control` without credentials or HTML.
- Fails closed for missing/ambiguous input fields, disabled buttons, or multiple possible login controls.

## Important current production state (November 14, 2026)

Renea's old ten-property ResNexus account was disconnected/deleted at 5:05 PM Central, and its ten calendar connections were disabled. Her new ResNexus browser account is stored but has **zero property mappings** and failed sign-in. Fixing login code alone will **not automatically restore those ten mappings or missing external blocks**. Remapping and a verified fresh sync are separate required steps before treating availability as reliable.

No historical canceled availability blocks should be indiscriminately reactivated: dates must first be checked against ResNexus. Published properties with no active feed carry a double-booking risk. Do not mark the connection healthy on deploy alone.

## Tests and limitations

14 automated, synthetic tests passed, with JavaScript syntax verified. The real ResNexus credential submission has NOT been successfully tested with the patched code, because this ChatGPT GitHub connection does not have repository write permission (GitHub 403) and the live Railway deployment still uses the older helper until you push.
