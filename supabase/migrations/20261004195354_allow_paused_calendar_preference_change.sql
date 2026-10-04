-- Production migration already applied on 2026-10-04.
-- Allows a PAUSED listing to change its availability preference before re-enabling.
-- PUBLISHED listings still preserve their live operational calendar source.

do $migration$
declare
  function_sql text;
  old_fragment text := 'when before_property.status in (''PUBLISHED'', ''PAUSED'')';
  new_fragment text := 'when before_property.status = ''PUBLISHED''';
begin
  select pg_get_functiondef(
    'public.save_property_listing(uuid,jsonb,text[],text[])'::regprocedure
  )
  into function_sql;

  if position(old_fragment in function_sql) = 0 then
    raise exception 'Expected paused calendar safeguard fragment was not found';
  end if;

  function_sql := replace(
    function_sql,
    old_fragment,
    new_fragment
  );

  execute function_sql;
end
$migration$;

comment on function public.save_property_listing(uuid, jsonb, text[], text[]) is
  'Host property save. Live PUBLISHED listings preserve their operational calendar source; PAUSED listings may change calendar preference before being re-enabled.';
