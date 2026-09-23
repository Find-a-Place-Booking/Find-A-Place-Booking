Find A Place Booking — Host Onboarding Completion Pass

This overlay fixes the two onboarding gaps that were forcing hosts to repeat work.

WHAT CHANGES

1) PHOTOS ARE REAL DURING ONBOARDING
- Entering the Photos step prepares the actual first DRAFT property/unit.
- The existing property-images bucket and property_images table are used.
- Upload validation matches the Property editor:
  JPG/PNG/WebP, max 10 MB each, max 12.
- The first photo remains the cover via sort_order.
- Photos can be removed in onboarding.
- Photos are attached to the same real property that onboarding finalizes.
- Hosts do NOT have to upload them again from Properties.

2) STRIPE CONNECT RUNS INSIDE ONBOARDING
- The existing EmbeddedStripeOnboarding component is reused.
- Existing Stripe login and new-to-Stripe flows remain unchanged.
- Onboarding checks /api/stripe/connect/sync.
- Hosts cannot continue normally from Payments until Stripe reports READY.
- Final completion checks the production payment_accounts record again:
  correct environment, READY, charges_enabled, payouts_enabled, account ref.
- No changes were made to direct-charge payment routing, application fees,
  refunds, taxes or Stripe processing behavior.

3) FINISH REALLY FINISHES THE FIRST PROPERTY
- Finish saves the latest onboarding draft.
- The final endpoint checks a real property photo and Stripe readiness.
- The provisional onboarding property is synchronized with the latest:
  property details, capacity, amenities, policies, rates and fees.
- Organization becomes ACTIVE through the existing create_property_from_onboarding flow.
- Map geocoding is attempted.
- Host is sent directly to the completed DRAFT property record.
- They no longer have to return to Properties to create the first property.

DATABASE
Migration 20260923093934 onboarding_real_photos_and_finalization
HAS ALREADY BEEN APPLIED to the current Supabase production project.
Keep the included migration file in the repo so migration history matches production.

FILES
- components/HostOnboardingWizard.tsx
- components/OnboardingPhotoManager.tsx
- components/OnboardingPhotoManager.module.css
- components/payments/OnboardingStripeSetup.tsx
- app/api/host/onboarding/photos/route.ts
- app/api/host/onboarding/complete/route.ts
- lib/host/finalize-onboarding-property.ts
- supabase/migrations/20260923093934_onboarding_real_photos_and_finalization.sql

RECOMMENDED TEST
Use a fresh host/test account:
1. Complete profile/property/location/amenities.
2. On Photos, upload 2-3 photos.
3. Leave Photos and return; confirm the real photos remain.
4. Finish rates/policies/calendar preference.
5. On Payments, run Stripe embedded onboarding.
6. Confirm it shows Ready after Stripe completion.
7. Finish Review.
8. Confirm redirect to the property editor.
9. Confirm photos are already present there.
10. Confirm Payments & taxes already shows the same Stripe account READY.
11. Confirm the property contains the onboarding rates, fees, policies and details.
