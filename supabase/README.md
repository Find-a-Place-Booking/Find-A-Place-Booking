# Supabase database source

This directory is the source-controlled database history for Find A Place Booking.

## Rules

- Every database change gets a new migration; do not silently edit production tables by hand and forget to capture the change here.
- Migrations are applied and verified one milestone at a time.
- Row Level Security is the default posture for application tables.
- Browser/user-scoped code never receives service-role/secret keys.
- Financial, reservation, commission, policy and tax history will be snapshotted in later migrations rather than reconstructed from current mutable records.

## Milestone 3

`migrations/20260903000100_foundation.sql` creates only the first identity/organization/admin/audit foundation:

- `profiles`
- `organizations`
- `organization_members`
- `admin_users`
- `admin_role_assignments`
- `audit_logs`

It also establishes the locked partner/commission states (`PARTNER_PENDING`, `VERIFIED`, `STANDARD_7`, `PARTNER_5`) without yet building the partner-verification workflow.

No public RLS policies are created yet. The tables are intentionally inaccessible to anonymous/authenticated clients until the authentication/RLS milestone explicitly defines access.

## Milestone 4 auth migration

After the foundation migration, apply:

```text
supabase/migrations/20260903000200_auth_foundation.sql
```

This adds profile synchronization from `auth.users`, first RLS policies and authorization helpers. It does not grant public admin signup or host-organization mutation access. Follow `docs/APPLY_MILESTONE_4.md` for the required Supabase Auth URL/email-template setup and admin bootstrap procedure.
