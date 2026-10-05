Find A Place Booking — Guest Email Form State Fix

Replace the included file at the same repo-relative path:

app/host/guest-emails/[slug]/page.tsx

What this fixes:
- Saved day-offset selections visually resetting or going blank.
- Uncontrolled guest-email form fields retaining stale values after a save.
- Stale values carrying between property/rule renders.

Implementation:
- Adds updated_at to the rule query/type.
- Keys the primary automation form by property, rule, kind and rule revision.
- Keys legacy rule forms by property, rule and rule revision.
- No database migration.
- No changes to the email scheduling or sending engine.
- No changes to booking/payment code.

Important:
This prevents new stale-form saves. It does NOT overwrite any existing customized email
content already stored in the database. Any templates that were previously saved with
the wrong wording should be reviewed and corrected after deployment.
