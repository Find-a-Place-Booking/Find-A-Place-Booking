Find A Place Booking — Host Cancel / Refund Buttons

Adds two actions to a CONFIRMED reservation:
- Cancel + refund guest
- Cancel without refund

Both require a reason and an explicit confirmation checkbox.

The refund path reuses the existing production cancellation/refund system:
create_refund_request -> approve_host_cancellation_with_refund ->
connected Stripe refund -> record_refund_result -> existing refund notifications.

The reservation/calendar block is released by the existing atomic cancellation
RPC before waiting for Stripe refund completion.

Security:
- Host access is verified with the normal signed-in host Supabase/RLS client
  before service-role calls are made.
- Existing guest cancellation requests are reused instead of duplicated.
- Host-initiated cancellations create an auditable HOST cancellation-request row.

Policy:
- Find A Place platform commission remains non-refundable.
- Guest refund is funded from the host connected Stripe charge.
- Cancel without refund is available only as an explicit, confirmed host action.

No database migration is required.
