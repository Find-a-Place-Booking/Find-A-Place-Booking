begin;

alter table public.site_content_blocks
  add column if not exists admin_editable boolean not null default false,
  add column if not exists content_group text,
  add column if not exists admin_label text,
  add column if not exists editable_fields text[] not null default array['eyebrow','title','body']::text[],
  add column if not exists policy_key text,
  add column if not exists sort_order integer not null default 0;

alter table public.site_content_blocks drop constraint if exists site_content_blocks_policy_key_check;
alter table public.site_content_blocks add constraint site_content_blocks_policy_key_check
check (policy_key is null or policy_key in ('guest_terms','host_agreement','cancellation_policy','privacy_notice'));

create table if not exists public.platform_policy_versions (
  policy_key text primary key check (policy_key in ('guest_terms','host_agreement','cancellation_policy','privacy_notice')),
  revision integer not null check (revision > 0),
  version_label text not null,
  effective_at timestamptz not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_policy_versions enable row level security;
drop policy if exists platform_policy_versions_public_select on public.platform_policy_versions;
create policy platform_policy_versions_public_select on public.platform_policy_versions
for select to anon, authenticated using (true);

insert into public.platform_policy_versions (policy_key,revision,version_label,effective_at) values
('guest_terms',6,'2026-09-22-v6','2026-09-19T00:00:00-05:00'::timestamptz),
('host_agreement',6,'2026-09-22-v6','2026-09-19T00:00:00-05:00'::timestamptz),
('cancellation_policy',6,'2026-09-22-v6','2026-09-19T00:00:00-05:00'::timestamptz),
('privacy_notice',3,'2026-09-22-v3','2026-09-19T00:00:00-05:00'::timestamptz)
on conflict (policy_key) do nothing;

create temporary table managed_copy_seed (
  key text primary key,
  content_group text not null,
  admin_label text not null,
  eyebrow text,
  title text not null,
  body text,
  editable_fields text[] not null,
  policy_key text,
  sort_order integer not null
) on commit drop;

insert into managed_copy_seed values
-- Existing managed homepage/about sections: metadata only on conflict.
('home.hero','Homepage','Hero','Find A Place Booking','Find a stay close to where you want to be.','Cabins, cottages, lake stays and places worth getting away to across Arkansas, Missouri and beyond.',array['eyebrow','title','body'],null,10),
('home.story','Homepage','Why Find A Place','Why Find A Place','Places worth staying. People ready to find them.','Find A Place brings travelers and independent hosts together around the places that make a trip worth remembering.',array['eyebrow','title','body'],null,20),
('home.host_cta','Homepage','Host callout','List your place','Put your stay in front of guests already planning the trip.','Share what makes your place worth the stay and let Find A Place help the right guests discover it.',array['eyebrow','title','body'],null,30),
('about.hero','About','Hero','About Find A Place','Unforgettable Stays. Exceptional Adventures.','Find A Place grew from a simple idea: the place you stay should feel connected to the trip you came to take.',array['eyebrow','title','body'],null,10),
('about.who','About','Who we are','Who we are','A travel and outdoor network built close to home.','Find A Place began around Arkansas travelers, outdoor communities, content creators and short-term-rental owners sharing cabins, campgrounds, rivers, lakes, trails and the places people kept asking about.',array['eyebrow','title','body'],null,20),
('about.what','About','What we do','What we do','We help people find the stay that fits the adventure.','We connect travelers with independent cabins, cottages, RV stays and other places to stay near the towns, lakes, rivers, trails and attractions they came to explore.',array['eyebrow','title','body'],null,30),
('about.community','About','Community section','Built from the places people share','The trip is bigger than the room you sleep in.','Find A Place has always been about more than a property listing. It is about the float, the trail, the lake, the small town, the waterfall, the local stop and the place you come back to at the end of the day.',array['eyebrow','title','body'],null,40),
('about.hosts','About','Host callout','For hosts','Independent places deserve a better way to be found.','Find A Place gives property owners a direct booking marketplace built around the destinations and audiences already looking for places to stay.',array['eyebrow','title','body'],null,50),

-- Hosts page
('hosts.hero','Hosting','Hero','For independent hosts','Your place should show up when someone is planning the trip.','Find A Place helps the right stay show up around the trip while you keep control of your property, rates, rules, guest relationship and payment account.',array['eyebrow','title','body'],null,10),
('hosts.commission','Hosting','Commission explanation',null,'Platform commission','Commission is calculated from the nightly lodging subtotal after host discounts, not legitimate cleaning fees, pet fees, taxes, refundable deposits or optional add-ons.',array['body'],null,20),
('hosts.value','Hosting','Benefits heading','What Find A Place handles','Built to help travelers find and book the right stay.','Find A Place keeps discovery, booking and host operations together without taking control away from the property owner.',array['eyebrow','title','body'],null,30),
('hosts.value.search','Hosting','Benefit: search visibility',null,'Show up when travelers are searching','Your listing can appear when guests search by destination, dates and group size.',array['title','body'],null,31),
('hosts.value.details','Hosting','Benefit: listing details',null,'Give guests the details they need','Photos, amenities, house rules, rates and your cancellation/refund terms stay together on one complete property page.',array['title','body'],null,32),
('hosts.value.manage','Hosting','Benefit: host dashboard',null,'Manage hosting in one place','Reservations, calendars, rates, fees, guest messages, cancellation requests, reports and listing details stay within your host dashboard.',array['title','body'],null,33),
('hosts.dashboard','Hosting','Dashboard section','Built for everyday hosting','Keep bookings, availability and guest details within easy reach.','Your host dashboard brings reservations, calendar availability, rates, messages, direct-payment records and listing details together. Stripe handles your balance and normal bank deposits.',array['eyebrow','title','body'],null,40),
('hosts.promotion','Hosting','Advertising section','Optional property promotion','Want a custom advertising plan too?','The booking marketplace and the Find A Place social/community side can work together. Advertising is optional and separate from the booking commission.',array['eyebrow','title','body'],null,50),
('hosts.steps','Hosting','Setup steps heading','Getting your place ready','From your property details to a stay travelers can find.','Host setup is broken into practical steps so you can finish a complete listing without one giant form.',array['eyebrow','title','body'],null,60),
('hosts.step1','Hosting','Setup step 1',null,'Tell us who''s hosting','Add the business/contact information and who manages the property.',array['title','body'],null,61),
('hosts.step2','Hosting','Setup step 2',null,'Build the stay','Add photos, amenities, occupancy, rates, fees and the house rules and cancellation terms guests need to know.',array['title','body'],null,62),
('hosts.step3','Hosting','Setup step 3',null,'Connect calendars and Stripe','Keep availability aligned and connect the host payment account that will own guest charges.',array['title','body'],null,63),
('hosts.step4','Hosting','Setup step 4',null,'Send it for review','Find A Place checks the listing, then it can appear in traveler searches.',array['title','body'],null,64),
('hosts.cta','Hosting','Bottom callout','Ready to add your place?','We''ll walk through it one piece at a time.','The host setup covers the property, amenities, rates, policies, calendars and payments without dropping everything into one giant form.',array['eyebrow','title','body'],null,70),

-- Help, Contact, Search, Property Policies
('help.hero','Help','Page intro','Find A Place support','Help & support','Find A Place provides the booking platform, payment-routing and communication tools. The host operates the property and handles stay-specific questions, requested booking changes and ordinary cancellation decisions under the property terms accepted at booking.',array['eyebrow','title','body'],null,10),
('help.booked','Help','Already booked',null,'Already booked a stay?','Open My Trip to review your reservation, see host contact details, message the host and send any cancellation request directly to the host. The reservation stays active unless the host approves a cancellation or another legally required change is made.',array['title','body'],null,20),
('help.property','Help','Property/check-in questions',null,'Questions about the property or check-in?','Use the host email, phone or reservation message thread shown on your secure trip page. The host is responsible for the property, arrival information and other stay-specific details.',array['title','body'],null,30),
('help.cancellation','Help','Cancellation/refunds',null,'Cancellation request or refund question?','The host''s cancellation and refund terms are shown before payment and saved with the reservation. A request sent from My Trip goes to the host; it does not automatically cancel the booking or create a refund. If the host approves a refund, Find A Place sends that host-authorized refund against the host''s connected payment charge and keeps the reservation record synchronized.

Find A Place''s host-paid platform commission remains earned and non-refundable when a booking is cancelled, refunded, shortened or changed. The host is responsible for any guest refund it approves.',array['title','body'],null,40),
('help.platform','Help','When to contact Find A Place',null,'When should you contact Find A Place?','Contact us for account access, technical problems, payment-record issues, suspected fraud, a host or guest who cannot be reached, or another platform issue. Find A Place may also act when required by applicable law, payment-provider rules or platform safety rules.',array['title','body'],null,50),
('help.host','Help','Host help',null,'Are you a host?','Sign in to the host portal for reservations, guest messages, calendars, direct-payment records, reports and property settings. Stripe controls your connected balance and bank-deposit timing.',array['title','body'],null,60),
('help.promotion','Help','Promotion help',null,'Want help promoting your property?','Find A Place can also put together a customized advertising and social media promotion plan for hosts. Promotion is optional and separate from the booking platform commission.',array['title','body'],null,70),
('contact.hero','Contact','Page intro','Contact Find A Place','Tell us what you need help with.','For property details, check-in or an ordinary cancellation request, contact the host from My Trip first. For platform, account, payment-routing or technical support, the Find A Place team is here.',array['eyebrow','title','body'],null,10),
('contact.guest','Contact','Guest support','For travelers','Guest support','Use My Trip for direct host contact, reservation messages and cancellation requests. Contact Find A Place for account access, technical issues, payment-record questions, fraud or other platform support.',array['eyebrow','title','body'],null,20),
('contact.host','Contact','Host support','For property owners','Host support','Help with your host account, listing, calendars, connected Stripe account, policies, reservations, guest communication or onboarding.',array['eyebrow','title','body'],null,30),
('contact.advertising','Contact','Advertising','Optional promotion','Customized advertising plan','Want more reach beyond the booking marketplace? Ask about a plan built around Find A Place''s social media and travel community, your property, location and the guests you want to reach.',array['eyebrow','title','body'],null,40),
('contact.network','Contact','Find A Place network','The original Find A Place network','See the travel and social side of Find A Place.','Browse the existing network, partner properties and travel content at Find A Place Arkansas & Beyond.',array['eyebrow','title','body'],null,50),
('stays.summary','Stay search','Search results intro',null,'Find your next stay','Browse published Find A Place stays and compare the places that fit your trip.',array['title','body'],null,10),
('property_policies.intro','Property policies','Page intro','Guest information','Property policies','Each Find A Place stay is independently operated and can have its own house rules, cancellation/refund terms and operating policies. The rules that apply to a reservation are presented with that property and reviewed again during checkout before payment.',array['eyebrow','title','body'],null,10),
('property_policies.includes','Property policies','What policies include',null,'What property policies can include','Depending on the stay, policies may cover occupancy, pets, minimum booking age, quiet hours, smoking, parking, check-in and checkout, cancellation/refund terms, property-specific instructions and an uploaded policy document from the host.',array['title','body'],null,20),
('property_policies.before','Property policies','Before booking',null,'Before booking','Open the property listing and review its rules before starting checkout. During checkout, Find A Place requires the booking guest to open the host''s property policies and the platform terms before accepting them and continuing to payment.',array['title','body'],null,30),
('property_policies.cancellation','Property policies','Cancellations/refunds',null,'Cancellations and refunds','Cancellation and refund requests go to the host and are decided under the property terms accepted for the reservation, subject to applicable law. Sending a request does not cancel the reservation or guarantee a refund. If the host approves a refund, it is funded from the host''s connected payment charge.

Find A Place''s host-paid platform commission is earned when a paid booking connects the guest and host. That commission is not refunded or reversed because the reservation is later cancelled, refunded, shortened or changed.',array['title','body'],null,40),
('property_policies.after','Property policies','After booking',null,'After booking','Open My Trip to review booking details, contact the host and send any cancellation or change request directly to the host. The reservation stays active until the host acts on the request and the platform records the resulting change.',array['title','body'],null,50),

-- Booking Terms
('policy.terms.intro','Booking Terms','Page intro','Find A Place','Booking Terms of Service','These terms govern use of Find A Place Booking. By creating or paying for a reservation, the booking guest agrees to these terms and to the property-specific policies presented during checkout.',array['eyebrow','title','body'],'guest_terms',10),
('policy.terms.marketplace','Booking Terms','Marketplace role',null,'Marketplace and software role','Find A Place provides listing-hosting, booking software, payment-routing, communication, verification and support tools for independently owned and operated stays. Unless a listing expressly says otherwise, Find A Place does not own, operate, maintain or manage the rental property. The host is responsible for the stay and the guest''s reservation is with that host.',array['title','body'],'guest_terms',20),
('policy.terms.communication','Booking Terms','Communication',null,'Guest and host communication','Find A Place provides a reservation message thread and may share the contact information needed for the host and guest to communicate about the stay. Guests should use the secure trip page for arrival questions, booking changes and cancellation requests.',array['title','body'],'guest_terms',30),
('policy.terms.verification','Booking Terms','Guest verification',null,'Guest information and verification','The booking guest must provide accurate contact information, including a working email address and phone number. Find A Place may require email and identity verification before payment.',array['title','body'],'guest_terms',40),
('policy.terms.property_rules','Booking Terms','Property rules',null,'Property rules','The guest must review the property policies saved with the reservation, including house rules, occupancy limits, pet rules, check-in and checkout requirements, cancellation terms and any uploaded policy document.',array['title','body'],'guest_terms',50),
('policy.terms.charges','Booking Terms','Charges and taxes',null,'Charges, taxes and payment processing','The checkout total may include lodging, host fees, add-ons and applicable taxes calculated for the reservation. The guest payment is processed on the host''s connected merchant account. Find A Place receives a host-paid platform commission through the processor''s application-fee mechanism. Tax amounts charged to the guest remain in the host''s connected account payment proceeds and are not retained by Find A Place. The host''s payment processor separately charges its processing fees to the host account.',array['title','body'],'guest_terms',60),
('policy.terms.cancellations','Booking Terms','Cancellations/refunds',null,'Cancellations and refunds','Cancellation and refund requests are decided by the host under the property policy accepted for the reservation, subject to applicable law. Sending a cancellation request does not itself create a refund. If a host approves a guest refund, the refund is funded from the host-owned connected-account charge. Find A Place''s platform commission is earned when the paid booking connects the guest and host and is not refunded or reversed as part of a guest cancellation or refund. The host remains responsible for the amount of any refund it authorizes.',array['title','body'],'guest_terms',70),
('policy.terms.changes','Booking Terms','Reservation changes',null,'Reservation changes','A guest may request changes to dates, occupancy or other booking details. A request does not change the reservation until the host approves and applies it. An approved change does not by itself authorize a new charge or refund. If the host separately approves a refund because of a change, Find A Place''s original platform commission remains non-refundable.',array['title','body'],'guest_terms',80),
('policy.terms.damage','Booking Terms','Guest responsibility',null,'Damage and guest responsibility','Guests are responsible for damage, missing property, excessive cleaning, unauthorized guests or pets, rule violations and other costs caused by the guest or the guest''s party, subject to evidence and applicable law. Find A Place is not an insurer or property-damage guarantee program.',array['title','body'],'guest_terms',90),
('policy.terms.limitations','Booking Terms','Platform limitations',null,'Platform limitations','To the maximum extent permitted by law, Find A Place is not responsible for the physical condition of independently operated properties, host or guest conduct, a host''s cancellation decision, personal property loss, third-party acts, travel interruptions or indirect or consequential losses.',array['title','body'],'guest_terms',100),
('policy.terms.safety','Booking Terms','Fraud/safety',null,'Fraud, safety and enforcement','Find A Place may pause platform access or transactions, request additional verification, preserve records, restrict listings, cooperate with payment providers and authorities, or take other reasonable action to address suspected fraud, chargebacks, safety concerns or legal obligations.',array['title','body'],'guest_terms',110),

-- Host Agreement
('policy.host.intro','Host Agreement','Page intro','For hosts','Find A Place Host Agreement','This agreement applies to hosts and property managers who create a host account or list a stay with Find A Place Booking.',array['eyebrow','title','body'],'host_agreement',10),
('policy.host.authority','Host Agreement','Authority to list',null,'Authority to list','The host represents that they own the property or have authority to market, rent and receive proceeds for it. The host is responsible for licenses, permits, permissions, insurance and compliance obligations that apply to the property or hosting activity.',array['title','body'],'host_agreement',20),
('policy.host.accuracy','Host Agreement','Accurate listings',null,'Accurate listings and safe stays','Hosts must keep listing details, availability, rates, fees, amenities, occupancy limits, photos, address information and property rules accurate. Hosts are responsible for the physical property, maintenance, access, habitability, safety equipment and services promised in the listing.',array['title','body'],'host_agreement',30),
('policy.host.relationship','Host Agreement','Guest relationship',null,'Guest relationship and communication','Confirmed reservations are between the host and the booking guest. Find A Place provides booking and communication software, while the host is responsible for the stay and booking-specific decisions.',array['title','body'],'host_agreement',40),
('policy.host.property_policies','Host Agreement','Property policies',null,'Property policies','Hosts may publish property policies and upload a policy PDF. Find A Place snapshots the policies associated with a reservation so the guest can review and accept the version presented at booking.',array['title','body'],'host_agreement',50),
('policy.host.payments','Host Agreement','Payments/commission',null,'Payment processing and Find A Place commission','Guest booking charges are processed directly on the host''s connected merchant account. The standard Find A Place commission is 7% of the commissionable lodging amount. Find A Place may assign selected host organizations a 5% partner commission rate. The partner rate is an internal account assignment and is not a host enrollment option; it applies only when Find A Place has expressly assigned it to the host account. The applicable rate shown in the host account at the time a reservation is created is snapshotted to that reservation.

Find A Place does not retain guest tax dollars in its application fee. Stripe or another processor separately charges processing fees to the host''s connected account.',array['title','body'],'host_agreement',60),
('policy.host.taxes','Host Agreement','Taxes',null,'Taxes','Find A Place may calculate applicable guest-facing lodging taxes as part of checkout. Those tax dollars remain in the host''s connected-account payment proceeds. The host is responsible for reporting, remitting and otherwise handling taxes associated with the host''s rental activity except to the extent applicable law or a separate written arrangement expressly provides otherwise.',array['title','body'],'host_agreement',70),
('policy.host.deposits','Host Agreement','Bank deposits',null,'Host balance and bank deposits','Find A Place does not hold or manually schedule ordinary host booking proceeds. The payment processor controls balance availability and bank deposit timing for the host''s connected account.',array['title','body'],'host_agreement',80),
('policy.host.cancellations','Host Agreement','Cancellations/refunds',null,'Cancellations, refunds and platform commission','Guest cancellation and refund requests are decided by the host under the property policy accepted for the reservation, subject to applicable law. A host may decline a refund, approve a partial refund, or approve a full guest refund where permitted by the applicable property terms. Find A Place''s platform commission is earned when a paid reservation connects the host and guest and is non-refundable. A cancellation, guest refund, host refund decision, date change, shortened stay or other reservation adjustment does not return, reduce or reverse the Find A Place commission.

When a host authorizes a guest refund, that refund is created against the host-owned payment charge and is the host''s financial responsibility. Guest taxes included in the refunded charge are returned through that host-owned charge as applicable. Processor fees are controlled by the processor and may also be non-refundable.',array['title','body'],'host_agreement',90),
('policy.host.changes','Host Agreement','Reservation changes',null,'Reservation changes','Hosts may approve or decline guest change requests. Applying new dates updates the reservation and Find A Place calendar together, but it does not automatically alter the amount already charged. Any additional charge or guest refund must be separately authorized. Find A Place''s original platform commission remains non-refundable even when the host approves a refund related to a reservation change.',array['title','body'],'host_agreement',100),
('policy.host.damage','Host Agreement','Damage/disputes',null,'Damage and disputes','Find A Place is not an insurer or damage-guarantee program. Hosts remain responsible for documenting and pursuing guest-caused damage claims.',array['title','body'],'host_agreement',110),
('policy.host.enforcement','Host Agreement','Account enforcement',null,'Account and enforcement','Find A Place may request verification, pause or remove listings, investigate complaints, restrict access or take other reasonable action to protect guests, hosts, the platform or legal compliance.',array['title','body'],'host_agreement',120),

-- Cancellation Policy
('policy.cancellation.intro','Cancellation Policy','Page intro','Booking policy','Cancellation Requests & Refunds','Find A Place provides booking software used by independently operated hosts and their guests. Each reservation is subject to the host''s cancellation and refund terms shown and accepted before payment.',array['eyebrow','title','body'],'cancellation_policy',10),
('policy.cancellation.host_terms','Cancellation Policy','Host terms govern',null,'The host''s accepted terms govern guest refunds','Hosts set the guest-facing cancellation and refund terms for their property. Those terms are saved with the reservation at booking. Subject to applicable law, the host decides whether a cancellation request is declined, cancelled without a refund, partially refunded or fully refunded.',array['title','body'],'cancellation_policy',20),
('policy.cancellation.request','Cancellation Policy','Request process',null,'How a guest requests cancellation','The guest can open the secure My Trip page and send a cancellation request directly to the host. The reservation remains confirmed while the request is pending. A request does not guarantee a cancellation or refund.',array['title','body'],'cancellation_policy',30),
('policy.cancellation.commission','Cancellation Policy','Commission rule',null,'Find A Place commission is non-refundable','Find A Place earns its platform commission when a paid reservation connects the guest and host through the marketplace. That commission is not refunded, credited back to the host or reversed because the reservation is later cancelled, refunded, shortened or changed.',array['title','body'],'cancellation_policy',40),
('policy.cancellation.refunds','Cancellation Policy','Host-approved refunds',null,'Host-approved guest refunds','If the host approves a guest refund, the refund is created against the host''s connected payment charge. The host is responsible for the amount it authorizes. A full guest refund may return the guest''s full eligible booking charge, including refundable taxes, while the Find A Place commission remains with Find A Place and is borne by the host. Processor fees are controlled by the payment processor and may not be returned.',array['title','body'],'cancellation_policy',50),
('policy.cancellation.changes','Cancellation Policy','Reservation changes',null,'Reservation changes','A reservation change does not automatically create a refund. If a host separately approves a refund because dates, occupancy or other booking details changed, the host-approved refund is funded from the host payment charge and the original Find A Place commission remains non-refundable.',array['title','body'],'cancellation_policy',60),
('policy.cancellation.calendar','Cancellation Policy','Booking/calendar record',null,'Booking record and calendar','Once a host-approved cancellation is completed, Find A Place records the reservation as cancelled and releases its internal availability block. Refund processing can continue separately without keeping the cancelled dates blocked.',array['title','body'],'cancellation_policy',70),
('policy.cancellation.role','Cancellation Policy','Find A Place role',null,'Find A Place''s role','Find A Place does not independently decide ordinary guest cancellation requests or guarantee that a host will approve a refund. Find A Place may provide technical support, preserve reservation records, correct platform or payment errors, and address fraud or safety issues.

Nothing in this policy limits rights or obligations that cannot legally be waived, assigned or transferred.',array['title','body'],'cancellation_policy',80),

-- Privacy Notice
('policy.privacy.intro','Privacy Notice','Page intro','Privacy','Privacy & Identity Verification Notice','Find A Place uses the information necessary to operate listings, bookings, payments, guest-host communication, cancellation requests, fraud prevention and support.',array['eyebrow','title','body'],'privacy_notice',10),
('policy.privacy.booking','Privacy Notice','Booking information',null,'Booking information','Booking records may include the guest''s name, email address, phone number, stay dates, party size, selected options, reservation messages, cancellation requests and responses, payment status and the policy versions accepted for the reservation.',array['title','body'],'privacy_notice',20),
('policy.privacy.email','Privacy Notice','Email verification',null,'Email verification','Find A Place may send a short-lived verification code to the booking email. Verification codes are stored as one-way hashes rather than readable codes.',array['title','body'],'privacy_notice',30),
('policy.privacy.identity','Privacy Notice','Identity verification',null,'Identity verification','Stripe Identity processes government identification and selfie verification when required for a booking. Find A Place stores the Stripe verification session reference, verification status and timestamp needed to operate the reservation. Find A Place does not intentionally store copies of the guest''s identity-document images or selfie in its own application database.',array['title','body'],'privacy_notice',40),
('policy.privacy.sharing','Privacy Notice','Guest/host sharing',null,'Information shared between guests and hosts','Hosts receive reservation information needed to operate the stay, including the guest''s name, booking email, phone number, party details and verification status. Guests may receive the host organization''s booking contact email and phone number. Messages and cancellation requests sent through Find A Place are stored with the reservation so the parties and authorized support staff can review the booking record.',array['title','body'],'privacy_notice',50),
('policy.privacy.payments','Privacy Notice','Payment providers',null,'Payment providers','Guest charges are processed by supported payment providers on the host''s connected account. Find A Place stores processor references and payment status needed to operate the reservation but does not store raw card or bank credentials.',array['title','body'],'privacy_notice',60),
('policy.privacy.providers','Privacy Notice','Service providers',null,'Service providers','Find A Place uses third-party providers for infrastructure, payments, identity verification, email delivery, fraud prevention and related operational services. Those providers process information under their own service terms and privacy obligations.',array['title','body'],'privacy_notice',70),
('policy.privacy.retention','Privacy Notice','Retention/legal requests',null,'Retention and legal requests','Reservation, message and financial records may be retained as reasonably necessary for accounting, disputes, fraud prevention, tax, support and legal obligations. Find A Place may disclose information when legally required or reasonably necessary to protect users, properties or the platform.',array['title','body'],'privacy_notice',80);

insert into public.site_content_blocks (
  key,eyebrow,title,body,is_public,admin_editable,content_group,admin_label,editable_fields,policy_key,sort_order
)
select key,eyebrow,title,body,true,true,content_group,admin_label,editable_fields,policy_key,sort_order
from managed_copy_seed
on conflict (key) do update set
  admin_editable = true,
  content_group = excluded.content_group,
  admin_label = excluded.admin_label,
  editable_fields = excluded.editable_fields,
  policy_key = excluded.policy_key,
  sort_order = excluded.sort_order;

create or replace function public.admin_update_managed_copy(
  content_key text,
  content_eyebrow text,
  content_title text,
  content_body text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  block_row public.site_content_blocks%rowtype;
  before_row jsonb;
  after_row jsonb;
  next_revision integer;
  next_version_label text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.admin_has_any_role(array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]) then
    raise exception 'Content editor role required';
  end if;

  select blocks.* into block_row
  from public.site_content_blocks blocks
  where blocks.key = content_key
  for update;

  if not found or not block_row.admin_editable then
    raise exception 'Content block is not admin editable';
  end if;

  select to_jsonb(blocks.*) into before_row
  from public.site_content_blocks blocks where blocks.key = content_key;

  update public.site_content_blocks blocks
  set eyebrow = left(nullif(trim(coalesce(content_eyebrow,'')),''),200),
      title = left(coalesce(nullif(trim(content_title),''),block_row.title),500),
      body = left(nullif(trim(coalesce(content_body,'')),''),20000),
      updated_by = actor_id,
      updated_at = now()
  where blocks.key = content_key;

  if block_row.policy_key is not null then
    select versions.revision + 1 into next_revision
    from public.platform_policy_versions versions
    where versions.policy_key = block_row.policy_key
    for update;

    if next_revision is null then next_revision := 1; end if;
    next_version_label := to_char((now() at time zone 'America/Chicago')::date,'YYYY-MM-DD') || '-v' || next_revision::text;

    insert into public.platform_policy_versions(policy_key,revision,version_label,effective_at,updated_by,updated_at)
    values(block_row.policy_key,next_revision,next_version_label,now(),actor_id,now())
    on conflict(policy_key) do update set
      revision = excluded.revision,
      version_label = excluded.version_label,
      effective_at = excluded.effective_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;

  select to_jsonb(blocks.*) into after_row
  from public.site_content_blocks blocks where blocks.key = content_key;

  insert into public.audit_logs(actor_profile_id,action,entity_type,reason,before_state,after_state,metadata)
  values(
    actor_id,
    case when block_row.policy_key is null then 'site_content.updated' else 'platform_policy.updated' end,
    case when block_row.policy_key is null then 'site_content' else 'platform_policy' end,
    case when block_row.policy_key is null then 'Admin updated managed public copy.' else 'Admin updated versioned platform-policy copy.' end,
    before_row,
    after_row,
    jsonb_build_object('key',content_key,'content_group',block_row.content_group,'policy_key',block_row.policy_key,'new_policy_version',next_version_label)
  );
end;
$$;

revoke all on function public.admin_update_managed_copy(text,text,text,text) from public, anon;
grant execute on function public.admin_update_managed_copy(text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
