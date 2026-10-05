-- Find A Place Booking
-- Publish reservation message inserts to Supabase Realtime.
--
-- RLS remains authoritative. Authenticated hosts only receive rows they can
-- already access through can_access_reservation(...). Guest My Trip remains
-- token/API based and does not get direct table access.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservation_messages'
  ) then
    execute
      'alter publication supabase_realtime add table public.reservation_messages';
  end if;
end
$$;
