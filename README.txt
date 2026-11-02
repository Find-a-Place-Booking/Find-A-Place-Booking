Find A Place Booking - Direct Overlay - Email Delivery Health (Round 3)

This ZIP contains actual replacement files, under their correct repo paths.
Extract and merge into the ROOT of your Find-A-Place-Booking repo.
No scripts, BAT files, or patch tools needed.

Adds:
- /admin/notification-health (read-only monitoring; super and operations admins only)
- An Email delivery link in the admin desktop/mobile menus
- 30-day send-error and team-copy overview
- Recent live confirmed booking delivery-coverage checks

No DB migration. No payment, calendar, booking data, or emails altered.
No auto-resending. No stored email HTML/text or private trip-token retrieval.
No changes to previous calendar overlay.

Verification before pushing: npm run typecheck and npm run build.
If these fail, stop and report errors. The ZIP itself has not deployed anything.

Remaining outstanding: the map's large-cluster expansion fix and ResNexus worker freshness/credentials still require separate work. Those are NOT fixed by this overlay.
