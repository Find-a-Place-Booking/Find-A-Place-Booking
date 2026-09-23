Find A Place Booking — Property Setup Pricing + Cancellation Cleanup

This package is cumulative with the previous live-content/self-publishing
overlay.

WHAT CHANGED

1. Rates & fees can be entered while a property is being created
   Draft / returned listings now show editable:
   - weeknight rate
   - weekend rate
   - default minimum stay
   - cleaning fee
   - pet fee

   These save into the SAME unit_rate_settings / unit_fees records used by
   the Rates & fees workspace and checkout. They are not a duplicate pricing
   store.

2. Advanced/live pricing is still protected
   Once a listing is PUBLISHED or PAUSED, this property page becomes read-only
   for operational pricing and points the host to Rates & fees. This prevents a
   stale property-details screen from overwriting seasonal rates, promotions,
   add-ons or other live pricing.

   Existing advanced values that are not represented on this initial setup
   screen (such as extra-guest pricing and pet calculation mode) are preserved.

3. Cancellation/refund terms are obvious and editable
   The old vague "Cancellation policy / notes" field is now:
     "Cancellation & refund terms · required to publish"

   It includes an example and explicitly explains that values such as:
     none / firm / moderate / strict
   are not complete guest-facing terms.

4. Publication readiness stays server-authoritative
   property_submission_issues() still controls whether the listing is ready.
   The host page refreshes after save so "Weeknight rate" and
   "Specific cancellation/refund terms" disappear from the readiness list as
   soon as valid values are stored.

5. No booking/payment processing changes
   This does NOT change:
   - Stripe Connect or direct-charge PaymentIntent logic
   - platform commission calculations
   - tax calculations
   - booking holds
   - reservation confirmation
   - webhook processing
   - calendars / iCal
   - refunds
   - guest checkout pricing

LIVE SUPABASE MIGRATIONS ALREADY APPLIED
- 20260923192556 property_setup_pricing
- 20260923192635 property_setup_pricing_preserve_advanced

The second migration is the final function definition and preserves advanced
pricing values when the initial property setup page saves standard pricing.

FILES ADDED / UPDATED FOR THIS PASS
- components/PropertyEditor.tsx
- app/host/properties/actions.ts
- supabase/migrations/20260923192556_property_setup_pricing.sql
- supabase/migrations/20260923192635_property_setup_pricing_preserve_advanced.sql

RECOMMENDED TEST
1. Open a DRAFT property.
2. Set weeknight/weekend rate, minimum stay, cleaning and pet fee.
3. Enter real cancellation/refund language (20+ characters).
4. Save property.
5. Refresh/open Rates & fees and confirm the same base pricing is present.
6. Return to property page and confirm Weeknight rate / cancellation issues are
   gone from Publication readiness.
7. Publish and verify checkout quotes use the same saved rates.
8. On a PUBLISHED property confirm the property editor shows pricing summary +
   Rates & fees link rather than editable live pricing.
