# Supabase migration-history note

The live database already contains Sep 28/29 automation objects, including
`host_guest_email_rules` and the ResNexus browser/automation tables, while the
migration-history list observed during the audit did not include all matching
repository migration versions.

Do **not** blindly replay those migrations against production just to make the
history list look correct.

If a future `supabase db push` reports remote/local migration-history mismatch:

1. Confirm the expected tables/functions already exist.
2. Use Supabase's migration-repair workflow to mark the already-applied version
   as applied.
3. Re-run `supabase migration list`.
4. Only then push new migrations.

Example for versions already verified as present in the live schema:

```powershell
supabase migration repair --status applied 20260928120100 20260928143000
```

Additional Sep 28/29 versions should only be marked applied after confirming
their objects are actually present.

This package does not modify migration-history metadata automatically.
