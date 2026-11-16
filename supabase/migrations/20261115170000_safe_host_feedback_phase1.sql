-- Find A Place Booking — host feedback Phase 1 (additive only).
-- New amenities are matched by label during the existing host save/onboarding RPC.
-- No existing booking, payment, availability, calendar, publication or rate routines modified.

insert into public.amenity_catalog (code, label, category, active) values
 ('toaster', 'Toaster', 'Kitchen & dining', true),
 ('blender', 'Blender', 'Kitchen & dining', true),
 ('ice-maker', 'Ice maker', 'Kitchen & dining', true),
 ('dishware-utensils', 'Dishware & utensils', 'Kitchen & dining', true),
 ('hair-dryer', 'Hair dryer', 'Comfort & entertainment', true),
 ('iron', 'Iron', 'Comfort & entertainment', true),
 ('linens-provided', 'Linens provided', 'Comfort & entertainment', true),
 ('towels-provided', 'Towels provided', 'Comfort & entertainment', true),
 ('shampoo', 'Shampoo', 'Comfort & entertainment', true),
 ('body-wash', 'Body wash', 'Comfort & entertainment', true),
 ('ceiling-fan', 'Ceiling fan', 'Comfort & entertainment', true),
 ('outdoor-dining-area', 'Outdoor dining area', 'Outdoor & location', true),
 ('fenced-yard', 'Fenced yard', 'Outdoor & location', true),
 ('private-entrance', 'Private entrance', 'Outdoor & location', true),
 ('smoke-alarm', 'Smoke alarm', 'Safety & family', true),
 ('carbon-monoxide-alarm', 'Carbon monoxide alarm', 'Safety & family', true),
 ('fire-extinguisher', 'Fire extinguisher', 'Safety & family', true),
 ('first-aid-kit', 'First aid kit', 'Safety & family', true),
 ('high-chair', 'High chair', 'Safety & family', true),
 ('travel-crib', 'Travel crib', 'Safety & family', true)
on conflict (code) do nothing;

-- Deliberately scoped duplication: one new DRAFT in the same host organization.
-- Copies reusable content, physical capacity, house rules and base pricing.
-- Does NOT copy: address/geocoding, tax certifications, photo storage paths,
-- calendars, imported blocks, PMS credentials, reservations, payment data,
-- messages, reviews, rate overrides, promo codes or any published state.
create or replace function public.duplicate_property_setup(source_property_id uuid)
returns table(property_id uuid, unit_id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_property public.properties%rowtype;
  source_unit public.property_units%rowtype;
  new_property_id uuid;
  new_unit_id uuid;
  new_slug text;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if source_property_id is null or not public.can_manage_property(source_property_id) then
    raise exception 'Property owner or manager access required';
  end if;
  select p.* into source_property from public.properties p where p.id = source_property_id;
  if source_property.id is null or source_property.status = 'ARCHIVED' then
    raise exception 'Source property unavailable';
  end if;
  select u.* into source_unit from public.property_units u
    where u.property_id = source_property_id and u.is_primary = true;
  if source_unit.id is null then
    raise exception 'Source listing has no primary unit';
  end if;

  -- Reuse the existing authorized draft creation flow and unique slug routine.
  select created.property_id, created.unit_id, created.slug
    into new_property_id, new_unit_id, new_slug
  from public.create_blank_property(
    source_property.organization_id,
    left(source_property.name || ' Copy', 180),
    source_property.property_type,
    source_property.public_area
  ) created;
  if new_property_id is null or new_unit_id is null then
    raise exception 'Could not create draft copy';
  end if;

  update public.properties p
    set description = source_property.description,
        custom_amenities = source_property.custom_amenities,
        custom_policies = source_property.custom_policies,
        notification_email = source_property.notification_email,
        operations_email = source_property.operations_email
  where p.id = new_property_id;

  update public.property_units u
    set max_guests = source_unit.max_guests,
        bedrooms = source_unit.bedrooms,
        beds = source_unit.beds,
        bed_configuration = source_unit.bed_configuration,
        bathrooms = source_unit.bathrooms,
        minimum_stay_nights = source_unit.minimum_stay_nights,
        check_in = source_unit.check_in,
        checkout = source_unit.checkout,
        cancellation_policy = source_unit.cancellation_policy
  where u.id = new_unit_id;

  update public.unit_rate_settings rs
    set currency = original.currency,
        weeknight_cents = original.weeknight_cents,
        weekend_cents = original.weekend_cents,
        included_guests = original.included_guests
  from public.unit_rate_settings original
  where rs.unit_id = new_unit_id and original.unit_id = source_unit.id;

  insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
  select new_unit_id, fee_type, label, amount_cents, calculation
  from public.unit_fees where unit_id = source_unit.id
  on conflict (unit_id, fee_type) do nothing;

  insert into public.unit_amenities (unit_id, amenity_code)
  select new_unit_id, amenity_code
  from public.unit_amenities where unit_id = source_unit.id
  on conflict do nothing;

  insert into public.unit_policies (unit_id, policy_code, configuration)
  select new_unit_id, policy_code, configuration
  from public.unit_policies where unit_id = source_unit.id
  on conflict do nothing;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, reason, metadata)
  values (actor_id, 'property.setup_copied', 'property', new_property_id,
          'Host copied reusable setup into a new draft.',
          jsonb_build_object('source_property_id', source_property_id, 'new_unit_id', new_unit_id));

  return query select new_property_id, new_unit_id, new_slug;
end;
$$;

-- Even though the RPC has an ownership guard, do not expose it to anonymous users.
revoke all on function public.duplicate_property_setup(uuid) from public, anon;
grant execute on function public.duplicate_property_setup(uuid) to authenticated;
