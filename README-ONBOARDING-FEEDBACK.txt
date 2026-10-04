Find A Place Booking — onboarding feedback access + sidebar scroll fix

WHAT THIS FIXES
1. Adds a permanent "Onboarding feedback" item to the desktop and mobile host menus.
2. Makes the desktop sidebar independently scrollable, so the Help card cannot be trapped below the viewport.
3. Adds /host/onboarding/feedback so hosts can complete the optional survey even after their account/property is already ready.
4. Saves feedback to Supabase FIRST, then emails both:
   - findaplacebookingtech@gmail.com
   - fancyhillcabinsandrvpark@gmail.com
5. If the host has multiple properties, they can choose which onboarding/property the feedback is about.
6. Hosts can resubmit/update feedback for the same property.
7. Captures automatic setup context: property status, calendar preference/connections, Stripe readiness, and onboarding status.
8. Flags low scores/heavy help as needs_review and substantive setup comments as FAQ/tool-tip candidates.

PRODUCTION DATABASE
Migration 20261004204909_host_onboarding_feedback_survey is ALREADY APPLIED.
Do not manually run it again in production. Keep the migration file in the repo so source control matches production.

EMAIL
Uses the existing RESEND_API_KEY and EMAIL_DOMAIN.
Optional EMAIL_FROM_HOST_FEEDBACK can override the sender local-part; otherwise it uses EMAIL_FROM_BOOKINGS or "bookings".

IMPORTANT
This patch is an overlay. Drop the files into the repo preserving paths.
No booking, checkout, calendar sync, payment, or guest reservation code is changed.
