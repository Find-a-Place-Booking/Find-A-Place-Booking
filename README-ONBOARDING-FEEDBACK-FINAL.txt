Find A Place Booking — final onboarding feedback flow

This supersedes the earlier onboarding-feedback overlays.

BEHAVIOR
- The survey is NOT a permanent sidebar or mobile-nav item.
- The desktop sidebar still scrolls independently so the Help card is reachable.
- After initial onboarding completes, the optional survey appears over the finished property page.
- If the host submits there, the thank-you message appears IMMEDIATELY in that onboarding dialog.
- If they choose Maybe later, nothing is stored and they can still answer later from Host Overview.
- Host Overview shows one inviting feedback card under the existing overview content.
- The full survey expands only when the host clicks "Give onboarding feedback."
- If the host submits from Overview, that same card IMMEDIATELY turns into the thank-you message.
- Closing the thank-you removes the card. On future Overview visits it stays gone.
- If the host completed the survey during onboarding, Overview never prompts them again.
- The survey is treated as once per host, not once per property.
- The old /host/onboarding/feedback page redirects back to Host Overview.
- Responses save to Supabase first, then email:
    findaplacebookingtech@gmail.com
    fancyhillcabinsandrvpark@gmail.com
- Resend failure does not lose feedback; the existing notification cron retries failed survey emails.
- Low scores/heavy human help are flagged needs_review; substantive comments are flagged faq_candidate.

PRODUCTION DATABASE
- Migration 20261004204909_host_onboarding_feedback_survey is ALREADY APPLIED.
- Do NOT manually run that migration again on production.
- The migration file is included only so the repository matches production.

TESTING PERFORMED
- 12 TS/TSX files in this overlay were syntax-transpiled with TypeScript: 0 syntax errors.
- The production feedback table was verified present.
- No full Next.js repo build was run here.

NO BOOKING-FLOW CHANGES
This overlay does not alter guest checkout, reservations, payments, pricing,
calendar sync, property publishing rules, or booking APIs.


DON'T GO EMPTY PROGRAM QUESTION
- Added a required Yes/No response inside the optional onboarding survey.
- Copy explains the program and makes clear that Yes is only interest in follow-up, not a commitment.
- Yes = "Yes, I'm interested"
- No = "No, not right now"
- Saved to host_onboarding_feedback.dont_go_empty_interest.
- The response is included clearly in the email sent to Jake and Renea.
- Production migration 20261004214057_host_feedback_dont_go_empty_interest is ALREADY APPLIED.
- Do not manually rerun that migration in production.


DON'T GO EMPTY OPTIONALITY UPDATE
- The Don't Go Empty question is OPTIONAL.
- A host can submit the onboarding survey without answering it.
- Yes and No are still saved when selected.
- If skipped, the database value remains null and the feedback email shows "Not answered".
- No database migration is needed for this change.
