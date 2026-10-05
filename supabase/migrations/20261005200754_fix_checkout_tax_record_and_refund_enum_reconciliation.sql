-- Mirrors production migration:
-- 20261005200754_fix_checkout_tax_record_and_refund_enum_reconciliation
--
-- Fixes:
-- 1) no-host-tax-config checkout paths reading an unassigned PL/pgSQL RECORD
-- 2) refund reconciliation assigning text CASE results to enum columns

do $fix$
declare
  ddl text;
  patched text;
begin
  select pg_get_functiondef(p.oid)
  into ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'calculate_reservation_checkout_tax'
    and pg_get_function_identity_arguments(p.oid) =
      'target_reservation_id uuid, expected_environment payment_environment';

  if ddl is null then
    raise exception 'calculate_reservation_checkout_tax definition not found';
  end if;

  if position('host_override_found boolean := false;' in ddl) > 0 then
    patched := ddl;
  else
    patched := replace(
      ddl,
      '  host_override_rule record;' || chr(10),
      '  host_override_rule record;' || chr(10) ||
      '  host_override_found boolean := false;' || chr(10)
    );

    patched := replace(
      patched,
      '    host_override_rule := null;',
      '    host_override_found := false;'
    );

    patched := replace(
      patched,
      '      limit 1;' || chr(10) ||
      '    end if;' || chr(10) || chr(10) ||
      '    if host_override_rule.line_id is not null then',
      '      limit 1;' || chr(10) ||
      '      host_override_found := found;' || chr(10) ||
      '    end if;' || chr(10) || chr(10) ||
      '    if host_override_found then'
    );
  end if;

  if position('host_override_found boolean := false;' in patched) = 0
     or position('host_override_found := found;' in patched) = 0
     or position('if host_override_found then' in patched) = 0 then
    raise exception 'Checkout tax function patch failed validation';
  end if;

  execute patched;
end
$fix$;

do $fix$
declare
  ddl text;
  patched text;
begin
  select pg_get_functiondef(p.oid)
  into ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'record_refund_result'
    and pg_get_function_identity_arguments(p.oid) =
      'target_refund_id uuid, target_provider_refund_id text, target_status refund_status, target_failure_message text';

  if ddl is null then
    raise exception 'record_refund_result definition not found';
  end if;

  patched := regexp_replace(
    ddl,
    'when is_full then ''REFUNDED''[[:space:]]+else ''PARTIALLY_REFUNDED''',
    'when is_full then ''REFUNDED''::public.reservation_payment_status
      else ''PARTIALLY_REFUNDED''::public.reservation_payment_status',
    'g'
  );

  patched := regexp_replace(
    patched,
    'when is_full then ''CANCELLED''[[:space:]]+else reservations\.status',
    'when is_full then ''CANCELLED''::public.reservation_status
      else reservations.status',
    'g'
  );

  if position('REFUNDED''::public.reservation_payment_status' in patched) = 0
     or position('CANCELLED''::public.reservation_status' in patched) = 0 then
    raise exception 'Refund enum patch failed validation';
  end if;

  execute patched;
end
$fix$;

revoke all on function public.calculate_reservation_checkout_tax(uuid, public.payment_environment)
  from public, anon, authenticated;
grant execute on function public.calculate_reservation_checkout_tax(uuid, public.payment_environment)
  to service_role;

revoke all on function public.record_refund_result(uuid, text, public.refund_status, text)
  from public, anon, authenticated;
grant execute on function public.record_refund_result(uuid, text, public.refund_status, text)
  to service_role;

notify pgrst, 'reload schema';
