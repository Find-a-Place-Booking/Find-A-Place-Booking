-- APPLIED TO FAP PRODUCTION SUPABASE ON 2026-11-16.
-- Source tracking only; do not run this manually again.
-- Atomic protection against an old listing-edit tab replacing newer changes.
do $safe_editor_revision$
declare
  original_sql text;
  patched_sql text;
begin
  select pg_get_functiondef(oid) into original_sql
  from pg_proc
  where pronamespace='public'::regnamespace and proname='save_property_listing'
  order by oid desc limit 1;

  if original_sql is null or strpos(original_sql,'__editorRevision') > 0
     or regexp_count(original_sql,'if not found then[[:space:]]*raise exception ''Property not found'';[[:space:]]*end if;',1,'i') <> 1 then
    raise exception 'Listing save function did not match the expected baseline';
  end if;

  patched_sql := regexp_replace(
    original_sql,
    'if not found then[[:space:]]*raise exception ''Property not found'';[[:space:]]*end if;',
    $insertion$
  if not found then
    raise exception 'Property not found';
  end if;

  -- Optional for older clients; enforced atomically for the revised property
  -- editor under the existing property-row lock.
  if listing_data ? '__editorRevision' then
    if nullif(trim(listing_data ->> '__editorRevision'), '') is null then
      raise exception 'Listing revision missing. Refresh before saving';
    end if;
    if before_property.updated_at is distinct from
       (listing_data ->> '__editorRevision')::timestamptz then
      raise exception 'Listing changed since it was opened. Refresh before saving';
    end if;
  end if;
$insertion$
  );
  if patched_sql = original_sql or strpos(patched_sql,'Listing changed since it was opened') = 0 then
    raise exception 'Editor conflict protection did not apply';
  end if;
  execute patched_sql;
end $safe_editor_revision$;
