# Find A Place Booking — Host publishing clarity + community host reviews
Reviewed against repository main as of 2026-10-31.

## Little Wolf Cabins — verified current state
Host account: Toni Gebers. 3 published and calendar-connected cabins (#1 Cedar Creek Cabin, #2 Lofted Pine, #5 Buckeye). #3 Blue Spruce is DRAFT, with no active calendar connection. The host has a ready live Stripe account. Do NOT force-publish Blue Spruce before the host confirms availability configuration.

Hosts publish themselves: Host > Properties > open the draft > scroll to Marketplace visibility > Publish listing. It becomes public immediately if the platform checks succeed; no admin approval/waiting period. This overlay also clarifies the path in the listing overview, labeling draft links “Finish & publish.”

## Public host reviews
- Existing reservation-verified guest reviews remain unchanged, and keep their own rating.
- Public host profiles now get a second section: community experiences, which can be submitted without booking through FAP.
- These are not labeled verified. The public section does not contribute to the verified guest rating or structured rating markup.
- Full name, email, experience type, rating and review are required; email remains private.
- Cloudflare Turnstile is required with action host_review and the existing Turnstile environment variables. No bypass if not configured.
- Submissions are private PENDING until approved at Admin > Host reviews by a Super or Operations Admin; reviewers cannot self-publish. One review per normalized email per host, plus a honeypot.
- Rejections remain in audit history; review status is not editable by hosts. No changes to payments, property publication rules, stays, refunds, calendars, or verified reviews.

## Install safely
1. Extract the ZIP to your local repository root, merging folders.
2. Run APPLY_OVERLAY.bat once on Windows, or `python3 apply_overlay.py .` from repository root. Extracting alone does not hook into the four existing components.
3. Run `npm run typecheck` and `npm run build` and push only if both pass.
4. Vercel deploys from GitHub. Browse a live /hosts/[slug] profile, submit a test review, then sign into Admin > Host reviews and approve it. Confirm it displays only under Community experiences, not Verified guest feedback.
5. The new table's migration was ALREADY APPLIED in production Supabase under version 20261031080310. The migration is included as a record; do not manually apply it a second time.

Important: The GitHub integration currently returns 403 to write operations. These frontend changes cannot be considered deployed until the ZIP is merged and pushed to GitHub. No guest test reviews were sent.
