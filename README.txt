Find A Place Booking - Optional Host Onboarding Feedback Survey

Production database status
- Migration 20261004204909_host_onboarding_feedback_survey is ALREADY applied.
- Do not manually run the migration again against production.
- Keep the migration file in the repo so source control matches production.

What this adds
- Optional survey shown after first host onboarding completes and the finished property page opens.
- “Maybe later” closes the survey and never blocks the property/listing.
- 1–5 overall ease score.
- Problem-area multi-select.
- Written questions for hardest/confusing parts, things that need better explanation,
  unnecessary steps, missing features, one-change request and additional comments.
- Human-help question plus details.
- 1–5 confidence score for adding another property alone.
- Automatic property/onboarding/calendar/Stripe context attached server-side.
- Automatic needs_review and faq_candidate flags.

Email delivery
- Feedback is saved in Supabase BEFORE email is attempted.
- Every submission is routed to BOTH:
    findaplacebookingtech@gmail.com
    fancyhillcabinsandrvpark@gmail.com
- RESEND_API_KEY and the existing EMAIL_DOMAIN are reused.
- EMAIL_FROM_HOST_FEEDBACK is optional. If omitted, the existing bookings sender local-part is reused.
- If the first email attempt fails, the existing /api/cron/notifications job retries pending/failed survey emails up to 5 attempts.
- Email failure never blocks the host from finishing onboarding or using the listing.

Files
- app/host/layout.tsx
- app/host/onboarding/feedback/actions.ts
- components/HostOnboardingFeedbackGate.tsx
- components/HostOnboardingFeedbackGate.module.css
- lib/notifications/host-onboarding-feedback.ts
- app/api/cron/notifications/route.ts
- supabase/migrations/20261004204909_host_onboarding_feedback_survey.sql
