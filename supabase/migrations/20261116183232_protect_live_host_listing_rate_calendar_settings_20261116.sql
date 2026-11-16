-- APPLIED TO FAP PRODUCTION SUPABASE ON 2026-11-16.
-- Source tracking only; do not run this manually again.
-- Preserves live/paused minimum-stay rules and calendar source when saving property details.
do $renea_safe_host_edit$
declare
  source_ddl text;
  changed_ddl text;
begin
  select pg_get_functiondef(p.oid) into source_ddl
  from pg_proc p
  where p.pronamespace='public'::regnamespace
    and p.proname='save_property_listing'
    and pg_get_function_identity_arguments(p.oid) like 'target_property_id uuid,%'
  order by p.oid desc limit 1;

  if source_ddl is null then
    raise exception 'Could not locate the existing listing-save function';
  end if;
  if regexp_count(source_ddl,'minimum_stay_nights[[:space:]]*=[[:space:]]*greatest[(]',1,'i') <> 1
     or regexp_count(source_ddl,'when before_property[.]status = ''PUBLISHED''[[:space:]]*then before_property[.]calendar_preference',1,'i') <> 1 then
    raise exception 'Expected host-save SQL layout changed; no changes applied';
  end if;

  changed_ddl := regexp_replace(
    source_ddl,
    'minimum_stay_nights[[:space:]]*=[[:space:]]*greatest[(][[:space:]]*coalesce[(]public[.]safe_integer[(]listing_data ->> ''minStay''[)], 1[)],[[:space:]]*1[[:space:]]*[)]',
    'minimum_stay_nights = case when before_property.status in (''PUBLISHED'', ''PAUSED'') then unit_row.minimum_stay_nights else greatest(coalesce(public.safe_integer(listing_data ->> ''minStay''), 1), 1) end'
  );
  changed_ddl := regexp_replace(
    changed_ddl,
    'when before_property[.]status = ''PUBLISHED''([[:space:]]*then before_property[.]calendar_preference)',
    'when before_property.status in (''PUBLISHED'', ''PAUSED'')\1'
  );

  if changed_ddl = source_ddl
    or strpos(changed_ddl,'minimum_stay_nights = case when before_property.status in (''PUBLISHED'', ''PAUSED'')') = 0
    or strpos(changed_ddl,'then before_property.calendar_preference') = 0 then
    raise exception 'Host save protection patch did not apply cleanly';
  end if;

  execute changed_ddl;
end $renea_safe_host_edit$;
