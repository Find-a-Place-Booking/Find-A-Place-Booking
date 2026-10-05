Find A Place Booking — Clickable Host Name

Incremental overlay for the public host profile feature.

Replace:
components/PublicHostCard.tsx

Change:
- On every public stay listing/detail page using PublicHostCard, the displayed
  host name itself now links directly to that host's public /hosts/[slug] page.
- The existing "View host profile & all stays" link remains.
- If a host somehow has no public slug yet, the name remains plain text so no
  broken link is created.

No database migration.
No listing, booking, payment, calendar, tax, or image logic changed.
