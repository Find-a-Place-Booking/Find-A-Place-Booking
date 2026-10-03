Find A Place Booking — Host calendar auto-switch fix

Current-main base verified before modification.

What changed:
- Property / unit dropdown now loads the newly selected calendar immediately.
- The old extra "Open calendar" submit step is removed.
- Current calendar month is preserved during the switch.
- Old result/detail query parameters are not carried into the new property.
- The selector shows a short loading state while the new unit is loading.
- The existing host calendar remains force-dynamic/no-store, and the calendar
  board is still keyed to unit + month.

Files:
- app/host/calendar/page.tsx
- components/CalendarUnitSelector.tsx

Not changed:
- ResNexus sync
- ThinkReservations sync
- availability data
- booking / checkout
- pricing
- Stripe
- database schema

No Supabase migration required.
