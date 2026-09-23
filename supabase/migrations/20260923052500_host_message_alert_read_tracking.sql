create or replace function public.mark_host_reservation_messages_read(
  target_reservation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  updated_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_reservation(target_reservation_id) then
    raise exception 'Reservation access denied';
  end if;

  update public.reservation_messages
  set read_by_host_at = coalesce(read_by_host_at, now())
  where reservation_id = target_reservation_id
    and sender_type = 'GUEST'
    and read_by_host_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$function$;

revoke all on function public.mark_host_reservation_messages_read(uuid) from public;
grant execute on function public.mark_host_reservation_messages_read(uuid) to authenticated;
grant execute on function public.mark_host_reservation_messages_read(uuid) to service_role;
