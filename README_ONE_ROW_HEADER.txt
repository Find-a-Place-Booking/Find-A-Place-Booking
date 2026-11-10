FIND A PLACE BOOKING — ONE-ROW HEADER DIRECT OVERLAY

1. Open this ZIP. Extract the 'components' folder over the same folder in
   your Find A Place Booking project. Allow overwriting of the 2 files.
2. Commit and push the updated project to GitHub / Vercel.
3. Hard-refresh the site after Vercel finishes building.

Changes: one horizontal desktop/laptop header (no second row), in this order:
Find a stay / Explore / Meet the hosts / For hosts / About / Social.
Account actions remain to the right: Saved, My trip, Host sign in,
List your property. Existing 'For hosts' dropdown is preserved.
At 1120px and below the existing phone/tablet drawer remains.

Only these existing paths are replaced:
- components/Header.tsx
- components/HeaderDesktopPolish.module.css

Does not touch Supabase, bookings, Stripe, calendars, or admin pages.
