Find A Place Booking — calendar/booking alignment fix

WHAT WAS CONFIRMED
- Guest-side ResNexus blocked dates are already correct.
- The problem was host-calendar visibility: ResNexus unresolved/safety ranges
  were used by guest availability but were not rendered by the host calendar.
- Site #3 is NOT a Fancy Hill property; it belongs to the Chris Graves org.
- The Solitude Cabin is NOT a Fancy Hill property; it belongs to the Wes
  Ashworth org.
- The only connected ResNexus browser account currently in production belongs
  to Fancy Hill Cabins and RV Park. This package does not guess or cross-map
  Site #3 or Solitude into Fancy Hill inventory.

CHANGES
1. HOST CALENDAR
   - Host calendar now reads the exact ResNexus unresolved/safety ranges used
     by guest-side protection.
   - Missing ranges are rendered as normal ResNexus unavailable dates.
   - Existing imported blocks are not duplicated.
   - Nothing is written into availability_blocks for display purposes.
   - The persistent ResNexus worker and guest-side availability logic are not
     changed.

2. BOOKING HOLD
   - /api/booking/hold now runs
     service_assert_resnexus_unit_availability_ready before creating a hold.
   - This matches the ResNexus guard already used immediately before payment.
   - A guest can no longer create a temporary checkout hold on a ResNexus
     unresolved/safety range that the guest calendar already marks unavailable.
   - No Stripe/payment-routing code was changed.

3. EXPIRED CHECKOUT CLEANUP
   - Production migration 20261005002225 is ALREADY APPLIED.
   - The existing 15-minute calendar cron already calls
     service_expire_abandoned_holds().
   - Cleanup now expires HOLD, PAYMENT_PENDING and PAYMENT_FAILED reservations
     after hold_expires_at when there is no SUCCEEDED/PROCESSING payment.
   - Their INTERNAL_HOLD availability blocks are cancelled and promo holds are
     released.
   - Payment rows and reservation events are RETAINED for audit/review.
   - Nothing is hard-deleted.

PRODUCTION MIGRATION NOTE
Do not manually rerun 20261005002225 in production.
The 20261005002504 / 20261005002645 / 20261005002755 / 20261005003027 files are
history-alignment no-op files for brief diagnostic migrations that were
superseded before release. The final application fix does not rely on them.

UNCHANGED
- Guest availability calculation
- Existing correct ResNexus guest blocks
- ThinkReservations mappings/sync
- Stripe charge flow
- Confirmed reservations
- Rates/pricing
- iCal imports/exports
- Property publishing rules

TESTING
- Syntax-transpile all TS/TSX files in this package before delivery.
- No full Next.js repository build is claimed.
