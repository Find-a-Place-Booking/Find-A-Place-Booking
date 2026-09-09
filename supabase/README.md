# Supabase migrations

Apply migrations in filename order. Never edit an already-applied migration to repair a development database; add a follow-up migration instead.

Current sequence:

1. `20260903000100_foundation.sql` — profiles, organizations, memberships, admin/audit foundation.
2. `20260903000200_auth_foundation.sql` — Auth profile trigger, RLS helpers and first policies.
3. `20260903000300_admin_foundation.sql` — Admin search/summary/partner verification RPCs.
4. `20260906000400_host_onboarding.sql` — host organization initialization, persisted onboarding, partner claims.
5. `20260909000500_fix_host_onboarding_save.sql` — contact-column ambiguity hotfix.
6. `20260909000600_fix_host_onboarding_organization_id.sql` — remaining onboarding `organization_id` ambiguity hotfix.
7. `20260909000700_property_crud.sql` — real properties/units, slug history, structured listing data, private property-image Storage, audited create/update/archive RPCs and Admin property visibility.
8. `20260909000800_step7_cleanup_host_avatar.sql` — private host-avatar Storage + host profile avatar path/RPC used by the Step 7 cleanup pass.

After migration 008, `/api/health/supabase` should report `property-crud-v1-cleanup`.

Do not add live payment credentials, raw banking details or SSNs to Supabase tables or migration files.
