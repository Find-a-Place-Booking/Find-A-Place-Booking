Find A Place Booking — Photo Limit 25 Overlay

Base: current GitHub main reviewed October 2, 2026.

Drop the contents of this ZIP over the matching repo paths.

Changed files:
- components/OnboardingPhotoManager.tsx
  - onboarding upload limit: 12 -> 25
  - limit message: 12 -> 25
  - helper copy: 12 -> 25
- components/PropertyEditor.tsx
  - live/draft property editor upload limit: 12 -> 25
  - limit message: 12 -> 25
  - counter: /12 -> /25
  - upload disabled threshold: 12 -> 25
- lib/public/listings.ts
  - guest-facing listing detail image loader: 12 -> 25

Not changed:
- booking flow
- checkout/payment logic
- availability/calendar sync
- Supabase schema/migrations
- image storage behavior
- gallery navigation/rendering logic

The existing PropertyGallery already renders the full images array dynamically, so no gallery rewrite is needed.

Verification:
All three overlay files were compared against the current main versions with only the intended 12 -> 25 replacements applied. Length, line count, and content hash matched exactly.
