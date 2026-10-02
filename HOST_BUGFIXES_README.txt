Find A Place Booking — Host bugfix overlay

Base reviewed: current GitHub main on October 2, 2026.

Drop the included paths over the matching repo paths.

FIX 1 — Default minimum stay field
components/PropertyEditor.tsx

The field previously used:
  value={form.minStay || "1"}

That caused the controlled input to immediately restore 1 when the host tried
to clear it before typing 2.

It now uses:
  value={form.minStay ?? ""}

The existing live save path already validates 1–365 nights and persists the
value into property_units.minimum_stay_nights through save_unit_base_pricing.
No database migration is needed.

FIX 2 — Calendar property switching
app/host/calendar/page.tsx

HostCalendarBoard is now keyed by selected unit + month, and
CalendarIntegrationPanel is keyed by selected unit.

That forces property-specific client state to remount when the host switches
from one cabin/unit to another instead of carrying state from the previous
selection.

The server-side calendar workspace already resolves pricing using the selected
unit ID. Live Supabase data was checked: Carol’s Cozy Cottage and Rhonda’s
Romantic Retreat have different base rates and different active Fall rate
rules, so the identical on-screen price points were not caused by shared
pricing data.

NOT CHANGED
- booking / checkout
- Stripe or payment logic
- availability calculations
- calendar sync/import parsing
- ResNexus / ThinkReservations logic
- rate values in Supabase
- database schema

Verification:
Reversing only these intended edits reproduces the exact content hashes of the
current main files:
- components/PropertyEditor.tsx -> d94f6378
- app/host/calendar/page.tsx -> f21fb4e3
