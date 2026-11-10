FIND A PLACE BOOKING — GUEST + HOST WEB-APP INSTALL DISCOVERY

REGULAR OVERLAY: Extract this ZIP at the ROOT of the current GitHub project and overwrite the matching files. There is no patch script or database migration.

Guest experience:
- The existing homepage social ribbon now has a compact "Get the free app" link, prominently visible on phones and desktop without adding a second header row.
- Mobile navigation also includes "Get the free guest app".
- /apps/guest remains the free guest app and has a clearer native install button / phone instructions.
- /apps is a refreshed guest and host app launch page.

Host experience:
- The host dashboard Overview shows a small, brand-fitting "Get host app" card.
- It links to the existing /host/mobile page where verified partner access or subscription/trial is checked. This does not bypass the paywall.
- Entitled hosts install from /host/mobile/workspace using the improved install control.

Install notes:
- On supported browsers the button can open the actual browser install prompt. Otherwise it displays Safari/Chrome instructions; it does not claim a native Play Store/App Store download.
- The site needs HTTPS, a valid PWA manifest, and supported browser behavior. These buttons do not install an app without user action.
- This overlay leaves payment, booking, calendar, membership and database logic untouched.

After pushing:
1. Visit / on a phone, click Get the free app and test Add to Home Screen at /apps/guest.
2. Visit /host as a host, follow Get host app to /host/mobile; verify a verified partner and an ordinary host see the right access paths.
3. After login/access, open /host/mobile/workspace and check the install button there.
4. Check the For hosts dropdown at desktop width and hamburger drawer on mobile.
5. Run npm run typecheck and npm run build if your local project is available.

Production Vercel logs were not accessible through the connected Vercel account, so this ZIP is not a verified production release.
