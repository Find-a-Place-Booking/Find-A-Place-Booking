Find A Place Booking — Live Content + Host Self-Publication Pass

THIS ZIP IS CUMULATIVE.
It includes the most recent booking/onboarding flow package plus these changes.

1. ADMIN SITE COPY NOW DRIVES THE PUBLIC HOSTS PAGE

Root cause found:
The admin editor was correctly saving hosts.* content rows to Supabase, but
app/hosts/page.tsx still contained hard-coded copy and never read those rows.

Fix:
- app/hosts/page.tsx now loads every existing hosts.* managed-copy block.
- Renea/Find A Place team edits now appear in the actual host marketing page.
- Fixed operational controls such as links and commission mechanics remain in code.
- lib/public/site-content.ts explicitly disables caching for these managed-copy
  reads so current public Supabase copy is used instead of a stale route/data value.
- Existing revalidatePath calls in the admin content action remain useful.

This also improves the other already-wired managed-copy pages because they use
the same public content loader.

2. HOSTS CAN PUBLISH THEIR OWN COMPLETE PROPERTIES

The separate admin publication step is no longer part of the normal host flow.

New database RPC:
  public.host_publish_property(uuid)

A host OWNER/MANAGER can publish a property only when:
- normal property_submission_issues() returns no required-field issues
- the organization has a LIVE Stripe account
- Stripe payment account status is READY
- charges are enabled
- payouts are enabled
- the provider account reference exists

The function is server-authoritative and writes review/audit history.

Host property UI:
- "Submit for review" is replaced by "Publish listing"
- publishing goes public immediately when requirements pass
- published listings remain host-editable under the existing live-edit rules
- public homepage/stays/property paths are revalidated after publish and live edits
- admin publication controls remain in place for moderation/override, but are
  no longer required for ordinary listings

Legacy PENDING_REVIEW / APPROVED records were returned to DRAFT so they are not
stuck in the old admin-publication workflow. Historical review events are kept.

CURRENT FANCY HILL NOTE
Whitetail Cabin at Crystal Ridge was the only legacy APPROVED property.
The live migration returned it to DRAFT so Renea can edit it. It is NOT auto-
published because its cancellation/refund terms are currently missing. Once
those required terms are added, the host can publish it directly.

3. ONBOARDING AUTO-PUBLICATION

After first-property onboarding finalizes:
- the real property is created/synced as before
- Find A Place attempts host_publish_property automatically
- if all requirements + live Stripe are ready, it goes PUBLISHED immediately
- if a required field is still missing, onboarding still completes safely and
  opens the property editor with the publication error so the host can fix it

No payment routing, booking, commission, tax, Stripe direct-charge, webhook,
reservation, refund or calendar logic was changed.

LIVE MIGRATIONS ALREADY APPLIED
- 20260923190652 host_self_publication
- 20260923190807 host_self_publication_copy_alignment

MEET THE TEAM
The old findaplacear.com site is JS-rendered and its Meet the Team page content
is not exposed through the public crawler/search sources available here. The
team member names, roles, bios and photos were therefore NOT fabricated.

To transfer it accurately, provide either:
- the exact old Meet the Team page URL if it is a different/hidden route, or
- screenshots/export of that page.

Once supplied, it can be added as /team or /meet-the-team and linked from the
booking platform navigation/footer without rewriting the team copy.
