alter table public.property_tax_lines
  drop constraint if exists property_tax_lines_category_check;

alter table public.property_tax_lines
  add constraint property_tax_lines_category_check
  check (
    category = any (
      array[
        'STATE_SALES'::text,
        'STATE_TOURISM'::text,
        'LOCAL_SALES'::text,
        'LOCAL_LODGING'::text,
        'OTHER'::text
      ]
    )
  );

do $body$
declare
  definition text;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='host_save_property_tax_configuration_v2';

  definition := replace(
    definition,
    '(''LOCAL_SALES'',''LOCAL_LODGING'',''OTHER'')',
    '(''STATE_SALES'',''STATE_TOURISM'',''LOCAL_SALES'',''LOCAL_LODGING'',''OTHER'')'
  );
  execute definition;

  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='service_save_property_tax_assistance_v2';

  definition := replace(
    definition,
    '(''LOCAL_SALES'',''LOCAL_LODGING'',''OTHER'')',
    '(''STATE_SALES'',''STATE_TOURISM'',''LOCAL_SALES'',''LOCAL_LODGING'',''OTHER'')'
  );
  execute definition;
end
$body$;

notify pgrst, 'reload schema';
