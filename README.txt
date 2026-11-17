FIND A PLACE BOOKING — HOST MOBILE ADD PROPERTY
Direct-file overlay | November 2026

Copy the app/ and components/ folders into the ROOT of the existing
Find A Place Booking Next.js project, preserving their paths and overwriting
only the files in this overlay. There are no patch scripts.

MODIFIED:
  app/host/mobile/workspace/page.tsx
  app/api/mobile/v1/host/properties/route.ts

NEW:
  app/host/mobile/workspace/add-property/page.tsx
  components/webapp/HostAddProperty.tsx

WHAT HOSTS GET
  + Add property entry from the Host web app home.
  Mobile-friendly new property form with name, type and public area.
  Property is created as DRAFT via existing create_blank_property RPC.
  Continues into the existing full property editor on the phone.
  Existing listing records, calendars, reservations, Stripe, tax settings,
  property status and rates are NOT changed by this overlay.
  Existing organization owner/manager checks remain in place.

NO SQL CHANGES NEEDED.

STAGING CHECKLIST
  1. Type-check/build (`npm ci && npm run build`).
  2. Sign in to host web app on a phone and tap + Add property.
  3. Try blank name and invalid property type; confirm no draft created.
  4. Create a test draft as an owner: the next editor must show that draft.
  5. Confirm the new property remains DRAFT until separately published.
  6. Confirm another organization's listings are not changed or accessible.
  7. Confirm existing Stays, Calendar, Messages and Rates tabs still work.
  8. Validate first-host saved-onboarding flow shows link rather than duplicate.
  9. Delete/archive any test draft using the normal property controls.

Deployment note: no code was pushed to GitHub by ChatGPT; repository write
attempts returned 403 from the GitHub integration. Upload this overlay and
run the build/deploy checks before releasing.
