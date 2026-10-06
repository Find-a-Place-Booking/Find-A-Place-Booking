-- Find A Place Booking
-- Hospitable/iCal outbound compatibility hardening.
--
-- Keep the token URL and stable event UID unchanged, but expose Find A Place
-- owner blocks and reservations as explicit booking-style VEVENT payloads.
-- Source-specific exports still exclude events that originated from that same
-- inbound calendar connection, preventing echo loops.

create or replace function public.calendar_export_payload(requested_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  token_row public.calendar_export_tokens%rowtype;
  calendar_name text;
  events jsonb;
begin
  select tokens.* into token_row
  from public.calendar_export_tokens tokens
  where tokens.token = requested_token
    and tokens.is_active;
  if not found then return null; end if;

  select coalesce(properties.name, units.name, 'Find A Place availability')
  into calendar_name
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = token_row.unit_id
    and units.is_active;
  if calendar_name is null then return null; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'uid', 'fap-' || replace(blocks.id::text, '-', '') || '@findaplacebooking.com',
        'start_date', blocks.start_date,
        'end_date', blocks.end_date,
        'event_type', blocks.block_type::text,
        'summary',
          case
            when blocks.block_type = 'INTERNAL_RESERVATION' then
              'Find A Place Reservation'
            when blocks.block_type = 'OWNER_BLOCK'
                 and lower(coalesce(blocks.label, '')) like '%direct%'
              then 'Find A Place Direct Booking'
            when blocks.block_type = 'OWNER_BLOCK'
                 and lower(coalesce(blocks.label, '')) like '%owner%'
              then 'Find A Place Owner Stay'
            when blocks.block_type = 'OWNER_BLOCK'
              then 'Find A Place Blocked Stay'
            else
              'External Reservation Block'
          end,
        'description',
          case
            when blocks.block_type = 'INTERNAL_RESERVATION' then
              'Reservation created through Find A Place Booking. These dates are unavailable.'
            when blocks.block_type = 'OWNER_BLOCK' then
              'Dates blocked through Find A Place Booking for an owner stay, direct booking, maintenance, or other unavailable period.'
            else
              'Availability block synchronized through Find A Place Booking from another calendar source.'
          end,
        'created_at', blocks.created_at,
        'updated_at', blocks.updated_at,
        'sequence', greatest(floor(extract(epoch from blocks.updated_at))::bigint, 0)
      )
      order by blocks.start_date, blocks.id
    ),
    '[]'::jsonb
  )
  into events
  from public.availability_blocks blocks
  where blocks.unit_id = token_row.unit_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type in ('OWNER_BLOCK', 'EXTERNAL_BLOCK', 'INTERNAL_RESERVATION')
    and blocks.end_date >= current_date - 30
    and (
      token_row.exclude_connection_id is null
      or blocks.connection_id is distinct from token_row.exclude_connection_id
    );

  return jsonb_build_object(
    'name', calendar_name,
    'unit_id', token_row.unit_id,
    'events', events
  );
end;
$function$;

revoke all on function public.calendar_export_payload(uuid) from public;
grant execute on function public.calendar_export_payload(uuid) to anon, authenticated;
