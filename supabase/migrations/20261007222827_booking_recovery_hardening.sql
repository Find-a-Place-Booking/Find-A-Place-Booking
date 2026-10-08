-- Find A Place Booking
-- Hardening for missed-booking recovery service-only records and FK lookups.

create index if not exists booking_recovery_settings_created_by_idx
  on public.booking_recovery_settings(created_by);
create index if not exists booking_recovery_settings_updated_by_idx
  on public.booking_recovery_settings(updated_by);

-- These tables deliberately contain recipient-level marketing/recovery data
-- and are never readable from the host browser. Explicit service-role policies
-- document that boundary while keeping anon/authenticated access absent.
drop policy if exists booking_recovery_offer_recipients_service_all
  on public.booking_recovery_offer_recipients;
create policy booking_recovery_offer_recipients_service_all
on public.booking_recovery_offer_recipients
for all to service_role
using (true)
with check (true);

drop policy if exists booking_recovery_suppressions_service_all
  on public.booking_recovery_suppressions;
create policy booking_recovery_suppressions_service_all
on public.booking_recovery_suppressions
for all to service_role
using (true)
with check (true);
