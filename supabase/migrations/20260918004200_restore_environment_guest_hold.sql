-- Find A Place Booking
-- Hotfix 042: restore the canonical environment-aware guest hold RPC.
--
-- Why this exists:
-- The remote database can contain an older create_guest_reservation_hold
-- signature even though migration history says pre-live hardening was applied.
-- The tax wrapper calls the canonical enum-typed signature directly, so we
-- reconcile that one function without replaying historical migrations.

begin;

do $restore_guest_hold$
declare
  desired regprocedure;
  legacy_ten regprocedure;
  legacy_text_env regprocedure;
  original_def text;
  patched_def text;
  provider_occurrences integer;
begin
  desired := to_regprocedure(
    'public.create_guest_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment)'
  );

  if desired is not null then
    raise notice 'Canonical environment-aware guest hold RPC already exists: %', desired;
    return;
  end if;

  legacy_ten := to_regprocedure(
    'public.create_guest_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text,text)'
  );

  if legacy_ten is not null then
    select pg_get_functiondef(legacy_ten) into original_def;

    patched_def := regexp_replace(
      original_def,
      'requested_guest_phone[[:space:]]+text([[:space:]]+DEFAULT[[:space:]]+NULL::text)?[[:space:]]*[)]',
      'requested_guest_phone text DEFAULT NULL::text, requested_payment_environment public.payment_environment)',
      'i'
    );

    if patched_def = original_def then
      raise exception 'Could not add payment environment to legacy guest hold RPC';
    end if;

    provider_occurrences := (
      length(patched_def) -
      length(replace(patched_def, 'accounts.provider = ''STRIPE''', ''))
    ) / length('accounts.provider = ''STRIPE''');

    if provider_occurrences <> 3 then
      raise exception
        'Expected three Stripe account lookups in guest hold RPC, found %; refusing blind rewrite',
        provider_occurrences;
    end if;

    patched_def := replace(
      patched_def,
      'accounts.provider = ''STRIPE''',
      'accounts.provider = ''STRIPE'' and accounts.environment = requested_payment_environment'
    );

    execute patched_def;

    raise notice 'Restored enum-typed guest hold RPC from the canonical 10-argument function.';
  else
    legacy_text_env := to_regprocedure(
      'public.create_guest_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text,text,text)'
    );

    if legacy_text_env is null then
      raise exception
        'No compatible create_guest_reservation_hold function exists to repair.';
    end if;

    -- Fallback for databases that already have an environment-aware function
    -- whose final argument was created as text instead of payment_environment.
    execute $fn$
      create or replace function public.create_guest_reservation_hold(
        target_unit_id uuid,
        requested_check_in date,
        requested_check_out date,
        requested_guest_count integer,
        requested_pet_count integer default 0,
        requested_add_on_ids uuid[] default '{}'::uuid[],
        requested_promotion_code text default null,
        requested_guest_name text default null,
        requested_guest_email text default null,
        requested_guest_phone text default null,
        requested_payment_environment public.payment_environment default 'TEST'
      )
      returns jsonb
      language sql
      volatile
      security definer
      set search_path = ''
      as $body$
        select public.create_guest_reservation_hold(
          target_unit_id,
          requested_check_in,
          requested_check_out,
          requested_guest_count,
          requested_pet_count,
          requested_add_on_ids,
          requested_promotion_code,
          requested_guest_name,
          requested_guest_email,
          requested_guest_phone,
          requested_payment_environment::text
        );
      $body$;
    $fn$;

    raise notice 'Restored enum-typed guest hold RPC through the existing text-environment implementation.';
  end if;

  if to_regprocedure(
    'public.create_guest_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment)'
  ) is null then
    raise exception 'Guest hold RPC repair did not create the required canonical signature.';
  end if;
end
$restore_guest_hold$;

revoke all on function public.create_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) from public, anon, authenticated;

grant execute on function public.create_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) to service_role;

-- Keep the old ten-argument entry point unavailable to service_role when it
-- exists, so checkout always uses the explicit TEST/LIVE environment path.
do $revoke_legacy_guest_hold$
begin
  if to_regprocedure(
    'public.create_guest_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text,text)'
  ) is not null then
    revoke all on function public.create_guest_reservation_hold(
      uuid,date,date,integer,integer,uuid[],text,text,text,text
    ) from service_role;
  end if;
end
$revoke_legacy_guest_hold$;

notify pgrst, 'reload schema';

commit;
