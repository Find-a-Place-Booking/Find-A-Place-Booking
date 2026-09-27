# Find A Place Booking — Photo Step Skip Overlay

Overlay contains one replacement file:

`components/HostOnboardingWizard.tsx`

Changes:
- Hosts may continue past the Photos step without uploading a photo yet.
- The final Review/Finish validation still requires at least one real property photo.
- Photos-step text explains that photos can be added later before final setup/publication.

Not changed:
- `prepare_onboarding_property()`
- Supabase functions or migrations
- `/api/host/onboarding/photos`
- photo upload/storage logic
- Stripe or any payment code
- booking flow

Apply by copying this overlay over the repository root, preserving folders, then run your normal typecheck/build/deploy.
