Find A Place Booking — Host Calendar Layout Fix

This overlay changes ONLY:
  app/host/calendar/calendar.module.css

What it fixes:
- Removes the fixed 360px right-side column that was squeezing the month calendar
  and pushing the connected-calendar controls off screen.
- Makes the month calendar the full-width primary workspace.
- Moves calendar-management cards underneath the calendar.
- Uses a two-column management layout on wide desktop:
    Block dates | Connected calendars
  with General iCal export spanning the full row.
- Stacks management cards cleanly on smaller desktop/tablet.
- Forces date fields, provider inputs, labels, URLs, connection cards and action
  rows to respect their container width.
- Long feed/export URLs wrap instead of forcing horizontal page overflow.
- Connected-calendar form uses available desktop width without becoming huge.
- Mobile horizontal scrolling is contained to the month calendar itself instead
  of stretching the entire host dashboard.
- Keeps the existing calendar behavior, sync logic, block types, imports,
  exports and booking/payment code untouched.

No database migration is required.
No payment, Stripe, booking, calendar-sync or availability logic is changed.
