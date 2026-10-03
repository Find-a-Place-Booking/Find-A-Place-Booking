Find A Place Booking — Autosave + 12-hour time fix

This bundle was generated against current main:
f2dc779fe29b7812b5a460d10bb4f898e9ea958b

What it changes
- Host onboarding immediately keeps a browser-local crash-recovery draft.
- Host onboarding autosaves to the existing server-side onboarding save path after ~1 second of inactivity.
- Property editor keeps a browser-local recovery draft and autosaves after ~1.2 seconds.
- Property autosave does NOT repeatedly geocode the address and does NOT autosave a URL slug change; those stay on the existing explicit Save action.
- Existing Save / Save & continue buttons remain intact.
- Host check-in, checkout, quiet hours, and guest-email send-time controls display 12-hour AM/PM choices while continuing to store HH:mm internally.
- Guest-facing property/check-in policy displays use 12-hour AM/PM.
- Existing timestamp helpers are made explicitly hour12 where applicable.

Apply
1. Put apply-autosave-time-fix.mjs in the repository root.
2. Run: node apply-autosave-time-fix.mjs
3. Run your normal build/deploy.

The script uses exact source checks and stops if a required current-main source block no longer matches. Run it on a clean working tree so normal Git rollback is available if your local source has moved ahead.
