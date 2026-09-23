Find A Place Booking — Cancellation Policy Publish Warning

This ZIP is cumulative with the reviews-finalized package.

NEW BEHAVIOR

A missing / incomplete cancellation-refund policy NO LONGER hard-blocks a host
from publishing a property.

The flow is:
1. Host clicks Publish listing / Enable listing.
2. If cancellation/refund terms are missing or only a short policy label, a
   confirmation modal appears.
3. The modal explains that guests will not have host-specific cancellation
   terms.
4. Host can go back and add a policy or click Publish without policy /
   Enable without policy.
5. The second action publishes the property.

All OTHER publication requirements remain hard blockers:
- property name
- description
- property type
- public area/city
- state/region
- active rentable unit
- max guests
- weeknight rate
- at least one photo
- live READY Stripe account with charges+payouts enabled

SERVER ENFORCEMENT

New RPC:
  public.host_publish_property_acknowledged(
    target_property_id uuid,
    allow_missing_cancellation boolean
  )

The database still calls property_submission_issues(). The cancellation issue is
ignored ONLY when the host explicitly submits allow_missing_cancellation=true.

That acknowledgement is written into audit_logs and property_review_events.

AUTOMATIC ONBOARDING PUBLICATION

Automatic onboarding publication still uses the strict
host_publish_property() path. It does not silently publish a property without
cancellation/refund terms. The host gets the warning when they manually publish.

GUEST CHECKOUT

If the host publishes without cancellation/refund terms, the guest policy
review clearly states that the host has not provided specific cancellation /
refund terms and tells the guest to contact the host if clarification is needed.

LIVE DATABASE

Migration already applied:
  20260923205044 publish_with_cancellation_acknowledgement

No booking/payment/Stripe/tax/calendar/refund logic was otherwise changed.
