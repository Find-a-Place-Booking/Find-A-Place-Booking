-- Find A Place Booking
-- Adds a non-polling calendar connection kind used by the temporary
-- ResNexus inbound-email bridge.
--
-- Keep this in its own migration. PostgreSQL must commit a newly-added enum
-- value before a later migration can safely use it.

alter type public.calendar_connection_kind
  add value if not exists 'EMAIL_BRIDGE';
