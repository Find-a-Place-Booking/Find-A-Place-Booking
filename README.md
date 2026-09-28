# Find A Place Booking — Mobile Calendar + Host Logo Fix

This overlay changes only:

- `app/host/calendar/calendar.module.css`
- `components/PublicHostCard.tsx`

## Mobile calendar

The calendar dates were not transposed. Existing mobile CSS forced the seven-day
calendar to a 640px minimum width, which pushed Thu-Sat offscreen on phones.

This overlay keeps all seven weekday columns visible on mobile and reduces only
the mobile cell/text sizing enough to fit.

## Host logo

The public host avatar could shrink horizontally inside the flex row, which made
a circular logo appear as a skinny vertical pill. The avatar is now locked to
54x54 and the image remains cropped with `object-fit: cover`.

No iCal/calendar sync logic, bookings, Stripe, Supabase, pricing, taxes, host
profile data, or image-storage logic is changed.
