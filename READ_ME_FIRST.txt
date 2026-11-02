Find A Place Booking — Direct overlay, November 1, 2026

Overlay contents:
  app/admin/calendars/page.tsx
  app/admin/calendars/attention/page.tsx

Copy app/ over the app/ folder of the Find A Place Booking repository.
Allow the two files to merge/replace in their existing paths.
Do not delete other files. Push to GitHub as usual.

The first file includes the previously delivered overdue-sync warning AND a
link to the new operations checks. The second creates /admin/calendars/attention.
No scripts or installers are used. No database changes or credentials required.

Check: npm run typecheck and npm run build as part of your normal GitHub push/deploy.
The current production main commit reviewed was 6b6484f (Oct 31, 2026).
If a newer developer has changed the calendar page since that commit,
review differences before replacing the existing file.

All new controls are READ-ONLY; only super and operations admins can view
external worker-account status. No payment, booking, or calendar data is edited.
