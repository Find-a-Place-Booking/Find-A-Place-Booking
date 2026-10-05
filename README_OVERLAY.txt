Find A Place Booking — desktop navigation repair overlay

DROP/UNZIP OVER THE PROJECT ROOT.

Replaces:
  components/HeaderMobileMenu.module.css

Fixes:
- Widens ONLY the public header from the old 1180px shell to a max 1440px.
- Keeps Find a stay / Meet the hosts / Explore / For hosts / About Find A Place
  on one line on full desktop.
- Keeps My trip, Host sign in and List your property on one line.
- Fixes the Saved link appearing white on the cream/light header.
- Tightens desktop spacing without changing the brand.
- Switches to the existing hamburger menu at <=1260px, before the nav can wrap.
- Leaves the existing <=700px phone drawer behavior intact.

No booking, checkout, calendar, auth, Supabase, or payment logic is touched.
No migration is required.
