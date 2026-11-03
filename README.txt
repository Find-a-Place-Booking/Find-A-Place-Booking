Find A Place Booking — Whitetail Property Name / URL Save Guard
November 3, 2026

DIRECT OVERLAY: Extract the ZIP at the ROOT of the existing GitHub repository,
allow the single code file to replace the same path, then commit and push.
No scripts, BAT files, database migrations or manual patch commands included.

REPLACES:
  app/host/properties/actions.ts

FIX:
- The listing title is not required to change the booking URL.
- When a host attempts to save a URL already used by another listing, including
  an archived listing, the existing canonical slug is fetched using the host's
  own authenticated Supabase client.
- The same existing save_property_setup database RPC is retried once with that
  unit's current slug, preserving the existing booking link and saving the
  listing name and other edits if the remainder of the form is valid.
- The editor gets the saved canonical slug and a plain-language notice that
  its requested URL was not changed.
- No database schema changes. No existing guest bookings, redirects, Stripe,
  rates or calendar blocks are changed by installing this update.

SPECIFIC CASE:
An archived Whitetail Cabin listing still owns
  /stays/whitetail-cabin-at-crystal-ridge
The published Whitetail Cabin uses
  /stays/whitetail-cabin-at-crystal-ridge-2
Do not repurpose the archived URL. Hosts can change their public listing name
without losing the working -2 booking URL.

VALIDATION:
- Exact original Git blob verified: a75affe4207620997257937df28b36e9889d5ddb
- Modified TypeScript source transpile syntax diagnostics: 0
- Full Next.js project build and production deployment: not performed.
