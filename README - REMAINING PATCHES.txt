FIND A PLACE BOOKING — SOURCE PATCHES STILL WAITING ON GITHUB WRITE ACCESS
November 4, 2026

The live guest-paid fee IS NOW ENABLED in the existing Supabase production database.
The current production website ALREADY runs the compatible guest-fee code from Round 8.
The following source files are NOT yet in GitHub main because the connected GitHub
integration returned HTTP 403: Resource not accessible by integration when
attempting to update app/api/booking/track/route.ts.

These replacement files cover:
- Booking availability telemetry classification (separates quick cancelled requests)
- Round 7 host signup security and read-only admin security review

Extract over the repository ROOT, overwriting only the matching source files.
Commit and push to GitHub. Wait for a READY Vercel production deployment.
Do NOT reapply the older Round 8 migration from scratch to the existing database.

PRODUCTION DATABASE ALREADY UPDATED (matching idempotent source migration included in this ZIP):
- Live guest-paid platform fee switch ON (5% partner / 7% standard)
- Insert-time guest fee snapshot to preserve immutable booking financial fields
- Corrected guest fee hold RPC
- Corrected preliminary mandatory statewide tax estimates
The added migration 20261104143000_guest_fee_live_snapshot_and_tax_preview.sql
reproduces the corrected functions. It does NOT flip the live fee switch when
creating a brand-new database. Do not overwrite these corrected functions with
the older staged SQL migration definitions.

Actual Airbnb price comparisons still require the APIFY_API_TOKEN external provider.
No app secrets or credentials are contained in this ZIP.

ROLLBACK OPTION if new guest fees need to be stopped immediately:
 UPDATE public.fap_guest_fee_rollout SET live_enabled = false, updated_at=now() WHERE id=true;
 This impacts future holds only; it does not alter existing reservations.
