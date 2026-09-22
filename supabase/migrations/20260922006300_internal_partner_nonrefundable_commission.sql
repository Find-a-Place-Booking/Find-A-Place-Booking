-- Find A Place Booking
-- Internal-only partner commission + non-refundable platform commission.
--
-- Product rules:
--   * STANDARD_7 is the default and only host-facing onboarding rate.
--   * PARTNER_5 can only be assigned by authorized Find A Place admins.
--   * Host onboarding cannot request or self-select partner status.
--   * Find A Place commission is earned on a paid booking and is not refunded
--     when the host later cancels, refunds or changes the reservation.

begin;

-- Retire any old host-submitted partner queue state. Keep historical claim rows
-- for audit, but hosts no longer have a partner-claim workflow.
update public.partner_claims claims
set
  status = 'WITHDRAWN',
  updated_at = now()
where claims.status = 'PENDING';

update public.organizations organizations
set
  partner_status = 'NOT_CLAIMED',
  commission_tier = 'STANDARD_7',
  partner_verified_by = null,
  partner_verified_at = null,
  partner_verification_note = null,
  updated_at = now()
where organizations.partner_status <> 'VERIFIED'
   or organizations.commission_tier <> 'PARTNER_5';

-- Remove stale partner form answers from onboarding drafts so they never reappear
-- if an older draft is reopened.
update public.host_onboarding_drafts drafts
set
  form_data =
    drafts.form_data
      - 'partnerClaim'
      - 'partnerBusiness'
      - 'partnerOwner'
      - 'partnerEmail'
      - 'partnerPhone',
  current_step = least(drafts.current_step, 9),
  updated_at = now()
where drafts.form_data ?| array[
  'partnerClaim',
  'partnerBusiness',
  'partnerOwner',
  'partnerEmail',
  'partnerPhone'
] or drafts.current_step > 9;

create or replace function public.admin_set_partner_commission(
  target_organization_id uuid,
  make_partner boolean,
  change_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.organizations%rowtype;
  after_row public.organizations%rowtype;
  cleaned_note text := nullif(trim(coalesce(change_note, '')), '');
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.admin_has_any_role(
    array['SUPER_ADMIN','PARTNER_ADMIN']::public.admin_role[]
  ) then
    raise exception 'Partner commission admin role required';
  end if;

  select organizations.*
  into before_row
  from public.organizations organizations
  where organizations.id = target_organization_id
    and organizations.status <> 'ARCHIVED'
  for update;

  if not found then
    raise exception 'Host organization not found';
  end if;

  if make_partner then
    update public.organizations organizations
    set
      partner_status = 'VERIFIED',
      commission_tier = 'PARTNER_5',
      commission_effective_from = now(),
      partner_verified_by = actor_id,
      partner_verified_at = now(),
      partner_verification_note = cleaned_note,
      updated_at = now()
    where organizations.id = target_organization_id
    returning organizations.* into after_row;
  else
    update public.organizations organizations
    set
      partner_status = 'NOT_CLAIMED',
      commission_tier = 'STANDARD_7',
      commission_effective_from = now(),
      partner_verified_by = null,
      partner_verified_at = null,
      partner_verification_note = cleaned_note,
      updated_at = now()
    where organizations.id = target_organization_id
    returning organizations.* into after_row;
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    actor_id,
    case
      when make_partner then 'partner_commission.assigned'
      else 'partner_commission.removed'
    end,
    'organization',
    target_organization_id,
    cleaned_note,
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object(
      'source', 'admin_partner_rates',
      'commission_tier', after_row.commission_tier,
      'commission_rate_bps',
        case when make_partner then 500 else 700 end
    )
  );

  return jsonb_build_object(
    'organization_id', after_row.id,
    'partner_status', after_row.partner_status,
    'commission_tier', after_row.commission_tier,
    'commission_rate_bps',
      case when make_partner then 500 else 700 end,
    'effective_from', after_row.commission_effective_from
  );
end;
$$;

revoke all on function public.admin_set_partner_commission(
  uuid,boolean,text
) from public, anon, authenticated;

grant execute on function public.admin_set_partner_commission(
  uuid,boolean,text
) to authenticated;

-- Host onboarding persists host/property draft information only. It cannot
-- submit a partner claim or mutate partner/commission fields.
create or replace function public.save_host_onboarding(
  target_organization_id uuid,
  target_step integer,
  draft_form jsonb,
  selected_amenities text[] default '{}'::text[],
  selected_policies text[] default '{}'::text[],
  selected_photo_names text[] default '{}'::text[],
  confirmed_authority boolean default false
)
returns table (
  organization_id uuid,
  partner_status public.partner_status,
  commission_tier public.commission_tier,
  onboarding_status public.host_onboarding_status,
  saved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_row public.organizations%rowtype;
  normalized_step integer :=
    least(greatest(coalesce(target_step, 0), 0), 9);
  next_onboarding_status public.host_onboarding_status;
  host_name text;
  contact_name text;
  v_contact_email text;
  v_contact_phone text;
  business_location_value text;
  cleaned_form jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(draft_form) <> 'object' then
    raise exception 'Invalid onboarding payload';
  end if;

  if octet_length(draft_form::text) > 60000 then
    raise exception 'Onboarding payload is too large';
  end if;

  if coalesce(array_length(selected_amenities, 1), 0) > 100
     or coalesce(array_length(selected_policies, 1), 0) > 100
     or coalesce(array_length(selected_photo_names, 1), 0) > 24 then
    raise exception 'Onboarding selection limit exceeded';
  end if;

  if not exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.profile_id = actor_id
      and members.status = 'ACTIVE'
      and members.role in ('OWNER','MANAGER')
  ) then
    raise exception 'Organization owner or manager access required';
  end if;

  select organizations.*
  into organization_row
  from public.organizations organizations
  where organizations.id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found';
  end if;

  cleaned_form :=
    draft_form
      - 'partnerClaim'
      - 'partnerBusiness'
      - 'partnerOwner'
      - 'partnerEmail'
      - 'partnerPhone';

  host_name :=
    nullif(trim(coalesce(cleaned_form ->> 'hostName', '')), '');
  contact_name :=
    nullif(trim(coalesce(cleaned_form ->> 'contactName', '')), '');
  v_contact_email :=
    nullif(lower(trim(coalesce(cleaned_form ->> 'email', ''))), '');
  v_contact_phone :=
    nullif(trim(coalesce(cleaned_form ->> 'phone', '')), '');
  business_location_value :=
    nullif(
      trim(coalesce(cleaned_form ->> 'businessLocation', '')),
      ''
    );

  update public.organizations organizations
  set
    name = coalesce(left(host_name, 160), organizations.name),
    primary_contact_name = left(contact_name, 160),
    contact_email = left(v_contact_email, 320),
    contact_phone = left(v_contact_phone, 80),
    business_location = left(business_location_value, 180),
    status =
      case
        when organizations.status = 'ARCHIVED'
          then organizations.status
        else 'ONBOARDING'
      end,
    onboarding_ready_at =
      case
        when confirmed_authority
          then coalesce(organizations.onboarding_ready_at, now())
        else null
      end,
    updated_at = now()
  where organizations.id = target_organization_id
  returning organizations.* into organization_row;

  next_onboarding_status :=
    case
      when confirmed_authority
        then 'READY_FOR_PROPERTY'::public.host_onboarding_status
      else 'IN_PROGRESS'::public.host_onboarding_status
    end;

  insert into public.host_onboarding_drafts (
    organization_id,
    owner_profile_id,
    current_step,
    status,
    form_data,
    amenities,
    policies,
    photo_names,
    authority_confirmed
  ) values (
    target_organization_id,
    actor_id,
    normalized_step,
    next_onboarding_status,
    cleaned_form,
    coalesce(selected_amenities, '{}'::text[]),
    coalesce(selected_policies, '{}'::text[]),
    coalesce(selected_photo_names, '{}'::text[]),
    confirmed_authority
  )
  on conflict on constraint host_onboarding_drafts_organization_id_key
  do update set
    current_step = excluded.current_step,
    status = excluded.status,
    form_data = excluded.form_data,
    amenities = excluded.amenities,
    policies = excluded.policies,
    photo_names = excluded.photo_names,
    authority_confirmed = excluded.authority_confirmed,
    updated_at = now();

  return query
  select
    organization_row.id,
    organization_row.partner_status,
    organization_row.commission_tier,
    next_onboarding_status,
    now();
end;
$$;

revoke all on function public.save_host_onboarding(
  uuid,integer,jsonb,text[],text[],text[],boolean
) from public;

grant execute on function public.save_host_onboarding(
  uuid,integer,jsonb,text[],text[],text[],boolean
) to authenticated;

comment on function public.save_host_onboarding(
  uuid,integer,jsonb,text[],text[],text[],boolean
) is
  'Persists host/property onboarding only. Partner status and commission tier are internal admin controls and cannot be requested or changed by hosts.';

-- Find A Place commission is never refunded by the cancellation/refund
-- workflow. A host-approved refund is funded entirely from the connected
-- account charge. Taxes are already host-owned under migration 060.
create or replace function public.create_refund_request(
  target_reservation_id uuid,
  requested_amount_cents bigint,
  requested_full_refund boolean,
  requested_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  payment_row public.payments%rowtype;
  refund_id uuid := gen_random_uuid();
  refunded_total bigint;
  remaining_amount bigint;
  final_amount bigint;
  days_before_check_in integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.*
  into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found';
  end if;

  select payments.*
  into payment_row
  from public.payments payments
  where payments.reservation_id = target_reservation_id
    and payments.provider = 'STRIPE'
    and payments.status in (
      'SUCCEEDED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
      'DISPUTED'
    )
  order by payments.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No refundable Stripe payment found';
  end if;

  select coalesce(sum(refunds.amount_cents), 0)
  into refunded_total
  from public.refunds refunds
  where refunds.payment_id = payment_row.id
    and refunds.status in ('PENDING','SUCCEEDED');

  remaining_amount :=
    greatest(payment_row.amount_cents - refunded_total, 0);

  if remaining_amount <= 0 then
    raise exception 'Payment is already fully refunded';
  end if;

  days_before_check_in := reservation_row.check_in - current_date;

  if requested_full_refund then
    final_amount := remaining_amount;
  else
    final_amount := requested_amount_cents;

    if final_amount is null
       or final_amount <= 0
       or final_amount >= remaining_amount then
      raise exception
        'Partial refund must be greater than zero and less than the remaining charge';
    end if;
  end if;

  insert into public.refunds (
    id,
    reservation_id,
    payment_id,
    payment_environment,
    status,
    idempotency_key,
    amount_cents,
    platform_fee_refund_cents,
    currency,
    reason,
    application_fee_refund_status
  ) values (
    refund_id,
    reservation_row.id,
    payment_row.id,
    payment_row.payment_environment,
    'PENDING',
    'fap-refund-' || refund_id::text,
    final_amount,
    0,
    payment_row.currency,
    left(
      nullif(trim(coalesce(requested_reason, '')), ''),
      500
    ),
    'NOT_REQUIRED'
  );

  return jsonb_build_object(
    'refund_id', refund_id,
    'payment_id', payment_row.id,
    'provider_payment_id', payment_row.provider_payment_id,
    'provider_charge_id', payment_row.provider_charge_id,
    'amount_cents', final_amount,
    'platform_fee_refund_cents', 0,
    'platform_tax_refund_cents', 0,
    'platform_commission_refund_cents', 0,
    'commission_refund_eligible', false,
    'platform_commission_non_refundable', true,
    'days_before_check_in', days_before_check_in,
    'is_full_refund', requested_full_refund,
    'currency', payment_row.currency,
    'payment_environment', payment_row.payment_environment
  );
end;
$$;

revoke all on function public.create_refund_request(
  uuid,bigint,boolean,text
) from public, anon, authenticated;

grant execute on function public.create_refund_request(
  uuid,bigint,boolean,text
) to service_role;

-- A host may cancel without a guest refund whenever the applicable property
-- policy and law permit it. The old platform-level 14-day cutoff is removed.
create or replace function public.complete_host_cancellation_without_refund(
  target_reservation_id uuid,
  target_request_id uuid,
  target_host_response text,
  target_responded_by uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  now_value timestamptz := now();
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.*
  into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;

  if not found or reservation_row.status <> 'CONFIRMED' then
    raise exception 'Only a confirmed reservation can be cancelled';
  end if;

  update public.reservation_cancellation_requests requests
  set
    status = 'COMPLETED',
    host_response =
      nullif(trim(coalesce(target_host_response, '')), ''),
    responded_by = target_responded_by,
    responded_at = now_value,
    completed_at = now_value,
    metadata =
      requests.metadata
      || jsonb_build_object(
        'resolution', 'NO_REFUND',
        'platform_commission_non_refundable', true,
        'source', 'host_reservation'
      ),
    updated_at = now_value
  where requests.id = target_request_id
    and requests.reservation_id = target_reservation_id
    and requests.status = 'REQUESTED';

  if not found then
    raise exception 'Cancellation request has already been answered';
  end if;

  update public.reservations reservations
  set
    status = 'CANCELLED',
    cancelled_at = coalesce(reservations.cancelled_at, now_value),
    hold_expires_at = null,
    updated_at = now_value
  where reservations.id = target_reservation_id;

  update public.availability_blocks blocks
  set
    state = 'CANCELLED',
    expires_at = null,
    updated_at = now_value,
    metadata =
      blocks.metadata
      || jsonb_build_object(
        'cancellation_request_id', target_request_id,
        'cancellation_released_at', now_value
      )
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type in (
      'INTERNAL_HOLD',
      'INTERNAL_RESERVATION'
    );

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  ) values (
    target_reservation_id,
    'HOST_CANCELLATION_APPROVED_NO_REFUND',
    target_responded_by,
    jsonb_build_object(
      'cancellation_request_id', target_request_id,
      'resolution', 'NO_REFUND',
      'platform_commission_non_refundable', true,
      'host_response',
        nullif(trim(coalesce(target_host_response, '')), '')
    )
  );
end;
$$;

revoke all on function public.complete_host_cancellation_without_refund(
  uuid,uuid,text,uuid
) from public, anon, authenticated;

grant execute on function public.complete_host_cancellation_without_refund(
  uuid,uuid,text,uuid
) to service_role;

create or replace function public.partner_refund_policy_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'partner-refund-policy-063-v1'::text;
$$;

revoke all on function public.partner_refund_policy_version()
  from public;

grant execute on function public.partner_refund_policy_version()
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
