-- Find A Place Booking
-- Pet fee calculation modes.
--
-- Adds host-selectable pet-fee behavior using the existing
-- property_fee_calculation enum:
--   PER_NIGHT        = per pet, per night (for PET fees only)
--   PER_PET_PER_STAY = per pet, per stay
--   FLAT_PER_STAY    = one flat pet fee per stay
--
-- No booking/payment/commission/tax/destination-charge architecture changes.

begin;

-- Patch the current canonical base-pricing RPC without replacing unrelated
-- pricing behavior added by prior migrations.
do $patch_base_pricing$
declare
  original_def text;
  patched_def text;
begin
  select pg_get_functiondef(
    'public.save_unit_base_pricing(uuid,jsonb)'::regprocedure
  ) into original_def;

  patched_def := replace(
    original_def,
    $old_decl$  pet_value integer := public.money_text_to_cents(pricing_data ->> 'pet');$old_decl$,
    $new_decl$  pet_value integer := public.money_text_to_cents(pricing_data ->> 'pet');
  pet_calculation_value public.property_fee_calculation := case upper(trim(coalesce(pricing_data ->> 'petCalculation', 'PER_NIGHT')))
    when 'PER_NIGHT' then 'PER_NIGHT'::public.property_fee_calculation
    when 'PER_PET_PER_STAY' then 'PER_PET_PER_STAY'::public.property_fee_calculation
    when 'FLAT_PER_STAY' then 'FLAT_PER_STAY'::public.property_fee_calculation
    else null
  end;$new_decl$
  );

  if patched_def = original_def then
    raise exception 'Could not add pet calculation mode to save_unit_base_pricing';
  end if;

  patched_def := replace(
    patched_def,
    $old_pet$  if pet_value is not null and pet_value > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (target_unit_id, 'PET', 'Pet fee', pet_value, 'PER_PET_PER_STAY');
  end if;$old_pet$,
    $new_pet$  if pet_value is not null and pet_value > 0 then
    if pet_calculation_value is null then raise exception 'Pet fee calculation mode is invalid'; end if;
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (target_unit_id, 'PET', 'Pet fee', pet_value, pet_calculation_value);
  end if;$new_pet$
  );

  if position('pet_calculation_value);' in patched_def) = 0 then
    raise exception 'Could not replace pet-fee insert in save_unit_base_pricing';
  end if;

  execute patched_def;
end
$patch_base_pricing$;

-- Patch the canonical quote boundary. This is the same quote used by host
-- preview and guest reservation creation, so the selected pet-fee mode is
-- snapshotted into the existing pricing totals without changing commission.
do $patch_quote$
declare
  original_def text;
  patched_def text;
begin
  select pg_get_functiondef(
    'public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text)'::regprocedure
  ) into original_def;

  patched_def := replace(
    original_def,
    $old_quote$      amount_value := case fee_row.calculation when 'PER_PET_PER_STAY' then fee_row.amount_cents * pet_count else fee_row.amount_cents end;$old_quote$,
    $new_quote$      amount_value := case fee_row.calculation
        when 'PER_NIGHT' then fee_row.amount_cents * pet_count * night_count
        when 'PER_PET_PER_STAY' then fee_row.amount_cents * pet_count
        when 'FLAT_PER_STAY' then fee_row.amount_cents
        else fee_row.amount_cents
      end;$new_quote$
  );

  if patched_def = original_def then
    raise exception 'Could not add pet calculation modes to quote_unit_stay';
  end if;

  execute patched_def;
end
$patch_quote$;

comment on function public.save_unit_base_pricing(uuid,jsonb) is
  'Host pricing save boundary. PET fees accept PER_NIGHT (per pet/night), PER_PET_PER_STAY, or FLAT_PER_STAY; commission remains lodging-only.';

comment on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text) is
  'Pre-tax pricing quote. PET fee calculation honors per-pet/night, per-pet/stay, or flat-per-stay host configuration without changing the lodging commission base.';

commit;
