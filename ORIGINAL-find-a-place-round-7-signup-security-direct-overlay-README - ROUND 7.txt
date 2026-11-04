FIND A PLACE BOOKING — ROUND 7 DIRECT OVERLAY
Signup security + admin account review | November 2, 2026

INSTALLATION
1. Extract this ZIP into the ROOT of your Find A Place Booking source folder.
2. Allow matching source files to replace the existing files; new files will
   appear automatically in their correct folders.
3. Push your project to GitHub. Vercel can then build/deploy the site.

NO scripts, batch files, SQL files, or install commands are in this ZIP.

WHAT CHANGED
- New host registration requires a usable contact phone (10–15 digits)
  and an extra server-side honeypot check against simple form bots.
- Existing Supabase Auth CAPTCHA, host agreement acceptance, login and
  password-reset flows are preserved.
- New /admin/signup-security screen provides a read-only account review:
  unconfirmed email, missing profile, missing host agreement or phone,
  and accounts with no host organization after seven days.
- Desktop and mobile admin menus gain Signup security; Super and Operations
  Admins are the only roles allowed to load the account-review data.
- No accounts are deleted, suspended, approved or modified by the screen.

BASELINE FILES VERIFIED AGAINST GITHUB MAIN
app/auth/actions.ts                0d54e9febb8e809519ebba23084312c4b6604a79
app/host/sign-up/page.tsx          3fb0288455732b838000bab3c2b9aa198bba44ae
components/AdminSidebar.tsx       444a2411e8b9ef3698f1ebc431d29ca3f926a1b7
components/AdminMobileNav.tsx     3d52179e7d12b62374e9ee767052dec7482ee317

CAUTION
The required phone rule applies to NEW registrations. Existing host accounts,
bookings, payment flows and calendars are not changed. Review signals are not
proof of fraud. Keep Supabase CAPTCHA and email confirmation configured: a
honeypot is just one extra check. This is only a source overlay, not a deploy.

VALIDATION
TypeScript/TSX source syntax and ZIP archive integrity checked offline.
A full Next.js build and live account creation test require applying this ZIP.
