-- Find A Place Booking
-- Adds an explicit calendar source kind for the temporary persistent-browser
-- ResNexus connector.
--
-- Keep this migration separate: PostgreSQL must commit a new enum value before
-- a later migration can use it.

alter type public.calendar_connection_kind
  add value if not exists 'BROWSER_WORKER';
