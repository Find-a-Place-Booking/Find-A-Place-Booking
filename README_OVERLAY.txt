Find A Place Booking — Mobile availability-first stay page

DROP/UNZIP OVER THE PROJECT ROOT.

What changes on phones (<=700px):
  Property photos
  -> live availability / booking card
  -> property details
  -> nearby experiences

Desktop/tablet ordering stays as it is now:
  Property photos
  -> nearby experiences
  -> details + sticky booking card

The BookingCard is NOT duplicated. It is the same component and the same
checkout/availability state; only CSS grid/flex ordering changes on mobile.

Files:
- app/stays/[slug]/page.tsx
- app/stays/[slug]/stay-mobile-order.module.css

No database, calendar, pricing, checkout, or booking logic changes.

GitHub connector write access returned 403, so this overlay was prepared
instead of claiming the repo was pushed.
