# Find A Place Booking — pre-test audit overlay

Base GitHub main: b402edf97cbf68876e0f52e02350d823c22fec91.
This is a drop-in overlay: paths inside this ZIP match the project root. It replaces only the included source files and adds forward migrations 057–060. The complete findings and Renea test order are in docs/PRETEST_AUDIT_2026-09-22.md.

Windows PowerShell, from the project folder:

    git rev-parse HEAD
    Expand-Archive -Path "C:\path\to\find-a-place-pretest-audit-overlay.zip" -DestinationPath . -Force
    npm ci
    npm run typecheck
    npm run build

Apply the four new SQL migrations in filename order to the appropriate Supabase project before testing these code paths. Compare the deployed migration history and schema before applying; these SQL files have not been run against the live database here. Deploy the changed app after the migrations. Keep Stripe in TEST mode for Renea's session. Verify the Connect webhook subscribes to payment_intent.succeeded, payment_intent.payment_failed, refund.created, refund.updated, refund.failed, and dispute events used by the webhook route.

The overlay was generated from the exact base commit above. If your local files contain newer work, compare them before overwriting. No environment files, credentials, media, or customer data are included.
