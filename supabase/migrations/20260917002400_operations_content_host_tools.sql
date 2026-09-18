-- Find A Place Booking
-- Operations/content/host tools pass.
--
-- Adds support tooling around the working booking/payment engine without
-- changing Stripe payment creation, payment routing, webhook confirmation,
-- availability locking, or the canonical reservation confirmation flow.

begin;

-- ---------------------------------------------------------------------------
-- Property policy PDF versioning
-- ---------------------------------------------------------------------------

create table if not exists public.property_policy_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null default 'application/pdf'
    check (content_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  version integer not null check (version > 0),
  is_current boolean not null default true,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (property_id, version)
);

create unique index if not exists property_policy_documents_current_unique
  on public.property_policy_documents(property_id)
  where is_current;

create index if not exists property_policy_documents_property_idx
  on public.property_policy_documents(property_id, created_at desc);

alter table public.property_policy_documents enable row level security;

drop policy if exists property_policy_documents_select_member_or_admin
  on public.property_policy_documents;
create policy property_policy_documents_select_member_or_admin
on public.property_policy_documents
for select to authenticated
using (public.can_access_property(property_id));

drop policy if exists property_policy_documents_insert_manager
  on public.property_policy_documents;
create policy property_policy_documents_insert_manager
on public.property_policy_documents
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.can_manage_property(property_id)
);

drop policy if exists property_policy_documents_update_manager
  on public.property_policy_documents;
create policy property_policy_documents_update_manager
on public.property_policy_documents
for update to authenticated
using (public.can_manage_property(property_id))
with check (public.can_manage_property(property_id));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'property-documents',
  'property-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists property_document_storage_select_member_or_admin
  on storage.objects;
create policy property_document_storage_select_member_or_admin
on storage.objects
for select to authenticated
using (
  bucket_id = 'property-documents'
  and (
    public.is_active_admin()
    or public.is_organization_member(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists property_document_storage_insert_manager
  on storage.objects;
create policy property_document_storage_insert_manager
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-documents'
  and public.can_manage_organization(((storage.foldername(name))[1])::uuid)
);

drop policy if exists property_document_storage_delete_manager
  on storage.objects;
create policy property_document_storage_delete_manager
on storage.objects
for delete to authenticated
using (
  bucket_id = 'property-documents'
  and public.can_manage_organization(((storage.foldername(name))[1])::uuid)
  and not exists (
    select 1
    from public.property_policy_documents documents
    where documents.storage_path = storage.objects.name
  )
);

create or replace function public.register_property_policy_document(
  target_property_id uuid,
  document_storage_path text,
  document_original_name text,
  document_size_bytes bigint
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  next_version integer;
  new_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_property(target_property_id) then
    raise exception 'Property owner or manager access required';
  end if;

  if split_part(document_storage_path, '/', 2) <> target_property_id::text then
    raise exception 'Document path does not match property';
  end if;

  select coalesce(max(documents.version), 0) + 1
  into next_version
  from public.property_policy_documents documents
  where documents.property_id = target_property_id;

  update public.property_policy_documents documents
  set is_current = false
  where documents.property_id = target_property_id
    and documents.is_current;

  insert into public.property_policy_documents (
    property_id,
    storage_path,
    original_name,
    size_bytes,
    version,
    is_current,
    uploaded_by
  ) values (
    target_property_id,
    left(document_storage_path, 700),
    left(document_original_name, 255),
    document_size_bytes,
    next_version,
    true,
    actor_id
  )
  returning id into new_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'property.policy_document_uploaded',
    'property',
    target_property_id,
    'Host uploaded a new version of the property policy PDF.',
    jsonb_build_object(
      'policy_document_id', new_id,
      'version', next_version,
      'storage_path', document_storage_path
    )
  );

  return new_id;
end;
$$;

revoke all on function public.register_property_policy_document(
  uuid,text,text,bigint
) from public;
grant execute on function public.register_property_policy_document(
  uuid,text,text,bigint
) to authenticated;

-- Automatically snapshot the CURRENT policy-document reference into every NEW
-- reservation. This does not modify the booking/payment functions.
create or replace function public.snapshot_current_policy_document()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  document_row public.property_policy_documents%rowtype;
begin
  select documents.*
  into document_row
  from public.property_policy_documents documents
  where documents.property_id = new.property_id
    and documents.is_current
  order by documents.version desc
  limit 1;

  if document_row.id is not null then
    new.policy_snapshot :=
      coalesce(new.policy_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'policy_document',
        jsonb_build_object(
          'id', document_row.id,
          'version', document_row.version,
          'original_name', document_row.original_name,
          'storage_path', document_row.storage_path
        )
      );
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_snapshot_policy_document
  on public.reservations;
create trigger reservations_snapshot_policy_document
before insert on public.reservations
for each row execute function public.snapshot_current_policy_document();

-- ---------------------------------------------------------------------------
-- Reservation support notes
-- ---------------------------------------------------------------------------

create table if not exists public.reservation_support_notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  admin_profile_id uuid not null references public.profiles(id),
  note text not null check (char_length(trim(note)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists reservation_support_notes_reservation_idx
  on public.reservation_support_notes(reservation_id, created_at desc);

alter table public.reservation_support_notes enable row level security;

drop policy if exists reservation_support_notes_admin_select
  on public.reservation_support_notes;
create policy reservation_support_notes_admin_select
on public.reservation_support_notes
for select to authenticated
using (public.is_active_admin());

drop policy if exists reservation_support_notes_admin_insert
  on public.reservation_support_notes;
create policy reservation_support_notes_admin_insert
on public.reservation_support_notes
for insert to authenticated
with check (
  public.is_active_admin()
  and admin_profile_id = (select auth.uid())
);

-- ---------------------------------------------------------------------------
-- Reservation-linked messaging
-- ---------------------------------------------------------------------------

create table if not exists public.reservation_conversations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.reservation_conversations(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  sender_type text not null check (sender_type in ('GUEST','HOST','ADMIN','SYSTEM')),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  read_by_host_at timestamptz,
  read_by_guest_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists reservation_messages_reservation_idx
  on public.reservation_messages(reservation_id, created_at);
create index if not exists reservation_messages_conversation_idx
  on public.reservation_messages(conversation_id, created_at);

create trigger reservation_conversations_set_updated_at
before update on public.reservation_conversations
for each row execute function public.set_updated_at();

create or replace function public.can_access_reservation(
  target_reservation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.reservations reservations
    where reservations.id = target_reservation_id
      and public.can_access_unit(reservations.unit_id)
  );
$$;

create or replace function public.can_manage_reservation(
  target_reservation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_admin() or exists (
    select 1
    from public.reservations reservations
    where reservations.id = target_reservation_id
      and public.can_manage_organization(reservations.organization_id)
  );
$$;

revoke all on function public.can_access_reservation(uuid) from public;
revoke all on function public.can_manage_reservation(uuid) from public;
grant execute on function public.can_access_reservation(uuid) to authenticated;
grant execute on function public.can_manage_reservation(uuid) to authenticated;

alter table public.reservation_conversations enable row level security;
alter table public.reservation_messages enable row level security;

drop policy if exists reservation_conversations_select_member_or_admin
  on public.reservation_conversations;
create policy reservation_conversations_select_member_or_admin
on public.reservation_conversations
for select to authenticated
using (public.can_access_reservation(reservation_id));

drop policy if exists reservation_conversations_insert_member_or_admin
  on public.reservation_conversations;
create policy reservation_conversations_insert_member_or_admin
on public.reservation_conversations
for insert to authenticated
with check (public.can_access_reservation(reservation_id));

drop policy if exists reservation_messages_select_member_or_admin
  on public.reservation_messages;
create policy reservation_messages_select_member_or_admin
on public.reservation_messages
for select to authenticated
using (public.can_access_reservation(reservation_id));

drop policy if exists reservation_messages_insert_host_or_admin
  on public.reservation_messages;
create policy reservation_messages_insert_host_or_admin
on public.reservation_messages
for insert to authenticated
with check (
  public.can_manage_reservation(reservation_id)
  and sender_type in ('HOST','ADMIN')
  and sender_profile_id = (select auth.uid())
);

-- ---------------------------------------------------------------------------
-- Verified reservation reviews
-- ---------------------------------------------------------------------------

create table if not exists public.reservation_reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.property_units(id) on delete cascade,
  guest_name_snapshot text,
  rating integer not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 4000),
  status text not null default 'PUBLISHED'
    check (status in ('PUBLISHED','PENDING','HIDDEN')),
  host_response text check (host_response is null or char_length(host_response) <= 4000),
  host_response_by uuid references public.profiles(id) on delete set null,
  host_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservation_reviews_property_idx
  on public.reservation_reviews(property_id, status, created_at desc);

create trigger reservation_reviews_set_updated_at
before update on public.reservation_reviews
for each row execute function public.set_updated_at();

alter table public.reservation_reviews enable row level security;

drop policy if exists reservation_reviews_select_host_or_admin
  on public.reservation_reviews;
create policy reservation_reviews_select_host_or_admin
on public.reservation_reviews
for select to authenticated
using (public.can_access_unit(unit_id));

drop policy if exists reservation_reviews_update_manager_or_admin
  on public.reservation_reviews;
create policy reservation_reviews_update_manager_or_admin
on public.reservation_reviews
for update to authenticated
using (public.can_manage_property(property_id) or public.is_active_admin())
with check (public.can_manage_property(property_id) or public.is_active_admin());

-- ---------------------------------------------------------------------------
-- Host profile gallery (primary avatar remains unchanged)
-- ---------------------------------------------------------------------------

create table if not exists public.host_profile_images (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists host_profile_images_profile_idx
  on public.host_profile_images(profile_id, sort_order, created_at);

alter table public.host_profile_images enable row level security;

drop policy if exists host_profile_images_select_self_or_admin
  on public.host_profile_images;
create policy host_profile_images_select_self_or_admin
on public.host_profile_images
for select to authenticated
using (
  profile_id = (select auth.uid())
  or public.is_active_admin()
);

drop policy if exists host_profile_images_insert_self
  on public.host_profile_images;
create policy host_profile_images_insert_self
on public.host_profile_images
for insert to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists host_profile_images_delete_self
  on public.host_profile_images;
create policy host_profile_images_delete_self
on public.host_profile_images
for delete to authenticated
using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Admin-managed public site content
-- ---------------------------------------------------------------------------

create table if not exists public.site_content_blocks (
  key text primary key,
  eyebrow text,
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  image_url text,
  is_public boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_content_blocks enable row level security;

drop policy if exists site_content_blocks_public_select
  on public.site_content_blocks;
create policy site_content_blocks_public_select
on public.site_content_blocks
for select to anon, authenticated
using (is_public);

insert into public.site_content_blocks (
  key, eyebrow, title, body, cta_label, cta_href
) values
(
  'home.hero',
  'Find A Place Booking',
  'Find a stay close to where you want to be.',
  'Cabins, cottages, lake stays and places worth getting away to across Arkansas, Missouri and beyond.',
  null,
  null
),
(
  'home.story',
  'Why Find A Place',
  'Places worth staying. People ready to find them.',
  'Find A Place brings travelers and independent hosts together around the places that make a trip worth remembering. Guests can discover cabins, lake stays, RV spots and one-of-a-kind places near where they are headed. Hosts get a better way to share what makes their place special with people already planning the trip.',
  'More about Find A Place',
  '/about'
),
(
  'home.host_cta',
  'List your place',
  'Put your stay in front of guests already planning the trip.',
  'Share what makes your place worth the stay and let Find A Place help the right guests discover it.',
  'See how hosting works',
  '/hosts'
),
(
  'about.hero',
  'About Find A Place',
  'Unforgettable Stays. Exceptional Adventures.',
  'Find A Place grew from a simple idea: the place you stay should feel connected to the trip you came to take.',
  null,
  null
),
(
  'about.who',
  'Who we are',
  'A travel and outdoor network built close to home.',
  'Find A Place began around Arkansas travelers, outdoor communities, content creators and short-term-rental owners sharing cabins, campgrounds, rivers, lakes, trails and the places people kept asking about. That community-first approach still shapes the booking platform today.',
  null,
  null
),
(
  'about.what',
  'What we do',
  'We help people find the stay that fits the adventure.',
  'We connect travelers with independent cabins, cottages, RV stays and other places to stay near the towns, lakes, rivers, trails and attractions they came to explore. For hosts, that means reaching people who are already planning a real trip instead of getting buried in a giant national catalog.',
  null,
  null
),
(
  'about.community',
  'Built from the places people share',
  'The trip is bigger than the room you sleep in.',
  'Find A Place has always been about more than a property listing. It is about the float, the trail, the lake, the small town, the waterfall, the local stop and the place you come back to at the end of the day.',
  null,
  null
),
(
  'about.hosts',
  'For hosts',
  'Independent places deserve a better way to be found.',
  'Find A Place gives property owners a direct booking marketplace built around the destinations and audiences already looking for places to stay. Hosts control their property information while Find A Place handles discovery, booking infrastructure and support.',
  'List your property',
  '/hosts'
)
on conflict (key) do nothing;

create or replace function public.admin_update_site_content(
  content_key text,
  content_eyebrow text,
  content_title text,
  content_body text,
  content_cta_label text,
  content_cta_href text,
  content_image_url text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row jsonb;
  after_row jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.admin_has_any_role(
    array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]
  ) then
    raise exception 'Content editor role required';
  end if;

  select to_jsonb(blocks.*)
  into before_row
  from public.site_content_blocks blocks
  where blocks.key = content_key;

  insert into public.site_content_blocks (
    key,
    eyebrow,
    title,
    body,
    cta_label,
    cta_href,
    image_url,
    is_public,
    updated_by,
    updated_at
  ) values (
    left(content_key, 120),
    left(nullif(trim(coalesce(content_eyebrow, '')), ''), 200),
    left(coalesce(nullif(trim(content_title), ''), 'Untitled'), 500),
    left(nullif(trim(coalesce(content_body, '')), ''), 12000),
    left(nullif(trim(coalesce(content_cta_label, '')), ''), 240),
    left(nullif(trim(coalesce(content_cta_href, '')), ''), 500),
    left(nullif(trim(coalesce(content_image_url, '')), ''), 1200),
    true,
    actor_id,
    now()
  )
  on conflict (key) do update
    set eyebrow = excluded.eyebrow,
        title = excluded.title,
        body = excluded.body,
        cta_label = excluded.cta_label,
        cta_href = excluded.cta_href,
        image_url = excluded.image_url,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  select to_jsonb(blocks.*)
  into after_row
  from public.site_content_blocks blocks
  where blocks.key = content_key;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    actor_id,
    'site_content.updated',
    'site_content',
    'Admin updated a public site content block.',
    before_row,
    after_row,
    jsonb_build_object('key', content_key)
  );
end;
$$;

revoke all on function public.admin_update_site_content(
  text,text,text,text,text,text,text
) from public;
grant execute on function public.admin_update_site_content(
  text,text,text,text,text,text,text
) to authenticated;

commit;
