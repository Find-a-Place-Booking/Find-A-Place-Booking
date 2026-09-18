Find A Place booking status hotfix

Replace:
  app/api/booking/status/route.ts

Then run:
  Remove-Item -Recurse -Force .next
  npm run typecheck
  npm run build
  npm run dev

Do NOT make another payment for the reservation that already succeeded.
After restarting, reload the existing /booking/confirmed?... URL.
