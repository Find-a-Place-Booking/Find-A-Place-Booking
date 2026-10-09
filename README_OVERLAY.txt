Find A Place Booking — direct property search + property video upgrade

DROP/UNZIP OVER THE PROJECT ROOT.

Guest property search
- Adds "Already know the place?" directly above the existing trip search.
- Autocompletes published property names after 2 characters.
- Prefix matches are ranked first, then other partial-name matches.
- Selecting a result goes straight to /stays/[slug].
- Pressing Enter / the search icon opens the first matching property.
- Available on both the home page and /stays because it is part of SearchBar.
- Does not change destination/date/guest search behavior.

Host property video
- Adds a Property Video panel to every host property editor.
- One optional video per property/unit.
- MP4 or WebM only for reliable cross-browser playback.
- Up to 60 seconds and 75 MB.
- Hosts can replace/remove it and choose "Use video as the main media."
- If primary, the stay page shows the video in the large gallery slot.
- If not primary, the video stays available from the gallery/watch-video control.
- Video never auto-plays merely because the stay page loaded; it auto-plays only after the guest explicitly opens the video viewer.
- The first photo remains the card/search/social fallback even when video is primary.
- Existing photo requirements and photo order are unchanged.

Database/storage
- Adds public.property_videos with host-only RLS access.
- Adds a private property-videos Storage bucket with host organization/property policies.
- Public stay pages receive only a short-lived signed video URL generated server-side after the listing has already passed the published-listing lookup.
- No anonymous/public table or bucket access is granted.
- Video MIME, size, duration and one-video-per-unit constraints are enforced in the database/storage layer as well as the UI.

Migrations
- supabase/migrations/20261009013500_property_video_media.sql
- supabase/migrations/20261009015800_property_video_media_hardening.sql
- supabase/migrations/20261009020100_property_video_duration_required.sql

All three schema migrations are already applied to production in this work session after validation. Keep the files in the repo for migration history; do not manually re-run them against production.

Validation completed
- All new/changed TS and TSX files passed isolated TypeScript transpile syntax checks.
- New search/video components passed a semantic TypeScript check with dependency shims.
- CSS module class references and brace balance were checked.
- Production RLS, grants, Storage bucket restrictions and policies were verified.
- Supabase security advisor reports no findings for property_videos/property-videos.
- The only current performance advisor note is the expected unused new FK index because the video table has no real rows yet.
- A transaction-only insert verified the new video table shape without leaving test data behind.
- Published-listing data was checked with Lil' Rustic to verify property-name search has the required slug/name/location fields.

GitHub connector write access still returns 403, so the application files are packaged as an overlay instead of a claimed push/deploy. The database/storage portion IS already live; the UI/API portion becomes live after this overlay is deployed.
