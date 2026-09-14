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
8. `20260909000800_step7_cleanup_host_avatar.sql` — private host-avatar Storage + host profile avatar path/RPC.
9. `20260909000900_add_changes_requested_status.sql` — property-review enum extension. Run and commit before migration 010.
10. `20260909001000_property_review_publication.sql` — host submission, admin review/approval/publication, safe public listing RPCs and review audit history.
11. `20260911001100_pricing_stay_rules_addons.sql` — date-based pricing, holiday minimum stays, additional-guest threshold, optional add-ons, deterministic pricing resolver and processor-neutral pre-tax quote boundary.
12. `20260913001200_promotion_codes_pricing_quote.sql` — host promotion/discount codes, property/organization scope, promo eligibility rules and promotion-aware quote/commission math.
13. `20260914001300_pricing_promotion_hardening.sql` — onboarding included-guest seed fix, advertised-special promo stacking control, promo currency enforcement and history-safe promo removal.
14. `20260914001400_calendar_availability_ical.sql` — canonical unit availability, owner blocks, source-scoped iCal connections/imports, tokenized exports, sync health/history and authoritative availability checks.
15. `20260914001500_calendar_hardening_performance.sql` — fail-closed calendar hardening support, private calendar-config visibility, bounded source/admin count RPCs, export-history trimming and hardening health marker.

After migration 015, `/api/health/supabase` should report `calendar-availability-hardening-v1`.

On a database already current through 014, run only 015. Never rerun already-applied migrations to pick up the hardening pass.

Do not add live payment credentials, raw banking details or SSNs to Supabase tables or migration files.
