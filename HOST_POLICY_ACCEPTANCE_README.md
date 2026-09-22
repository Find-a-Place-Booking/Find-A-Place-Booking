# Host Policy Acceptance Overlay

This adds a real, auditable host-policy acceptance step to host onboarding.

What changes:
- Host Agreement acceptance is separate from the existing authority-to-list checkbox.
- Host must accept:
  - current Host Agreement
  - current Cancellation Policy
  - current Privacy Notice
- Supabase records:
  - acceptance timestamp
  - accepting profile
  - exact version of each policy
- An audit-log event is written.
- Database trigger blocks `READY_FOR_PROPERTY` if policy acceptance has not been recorded.
- If policy version constants change later, the onboarding screen treats the old acceptance as stale and asks for acceptance again.

Apply:
```powershell
npx supabase db push
npm run typecheck
npm run build
```

For a full reset of the fake demo host after migration 062, also clear:
```sql
host_policy_accepted_at = null,
host_policy_accepted_by = null,
host_agreement_version = null,
cancellation_policy_version = null,
privacy_notice_version = null
```
on that host's `host_onboarding_drafts` row.
