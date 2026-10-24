FIND A PLACE BOOKING - 2-night calendar clarity - DROP-IN OVERLAY

Files:
  components/AvailabilityDatePicker.tsx

APPLY:
1. Extract this ZIP into the root of your Find A Place Booking repository.
2. Allow it to replace components/AvailabilityDatePicker.tsx.
3. Run npm run build, review the changed file, then commit and push.

CHANGES:
- Makes the meaning of checkout dates explicit for minimum-stay rules.
- If a guest has selected a longer booking, offers a small shortcut to
  choose the minimum permitted stay, assuming those nights are open.
- Existing minimum-stay rules and blocked dates are still respected.

DOES NOT CHANGE:
- Database, tax calculation, booking holds, payment, Stripe, calendar
  integrations, availability APIs, or pricing rules.

Verified from database: Dogwood and Redbud cottages both have a 2-night
minimum. A two-night stay Nov 25 to Nov 27, 2026 was accepted by the
server-side availability and quoting functions.

This is a UI improvement, not a proven root-cause repair of every
reported booking issue. Test a 2-night booking flow before publishing.
