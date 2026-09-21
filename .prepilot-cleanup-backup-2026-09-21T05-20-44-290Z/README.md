# Find A Place contact/social styling hotfix

Apply this **after** the `find-a-place-contact-social-ad-pass` package.

This hotfix fixes the styling shown in the contact-page screenshots by:

- moving `/contact` to a route-local CSS module so the card/grid styling cannot be lost because of a missing global CSS import;
- restoring spacing between buttons and their helper notes;
- restoring the 3-card desktop layout and responsive mobile/tablet layouts;
- polishing the original Find A Place network callout and related links;
- appending the shared Help/footer/host-promotion styles directly to `app/find-a-place-theme.css` so those additions remain styled even if the standalone pass stylesheet was not loaded.

## PowerShell

From the extracted hotfix folder:

```powershell
.\apply-contact-styling-hotfix.ps1 -Target "C:\Users\jlccu\find-a-place-booking-production-step-1"
cd "C:\Users\jlccu\find-a-place-booking-production-step-1"
npm run typecheck
npm run build
```

Then restart `npm run dev` if needed and hard-refresh the browser.

## Files changed

- `app/contact/page.tsx`
- `app/contact/contact.module.css` (new)
- `app/find-a-place-theme.css` (shared styles appended once)

No Stripe, Supabase, reservation, tax, payout, calendar, or booking logic is changed.
