# Direct/Estimated Comparison QA

Scope: only guest comparison UI and verified/estimated comparison API guards.

Validated in the current turn:
- Source anchor checks against GitHub main `d2e6a7a229b41e944f98eb5e3f9367d1dba871a0` (comparison route) and `3e15fef1153a84598bc50d96f1fc52f133f8e3db` (collector).
- Source-patching unit tests pass: idempotence, missing-anchor abort, verified source check, linked fallback, public page opt-in, negative/zero difference copy, no guest-visible competitor label.
- `components/DirectBookingValue.tsx` parses/transpiles as TSX using TypeScript.
- No new API credentials, backend migrations or database writes.

Remaining for application/deployment QA:
- Run `npm run build` against the complete repository.
- Confirm the user-facing component renders under the exact price after dates are selected on property page and checkout. This overlay does not change its placement.
- Confirm an unlinked property returns `ESTIMATED` when the model has sufficient valid pricing fields.
- Confirm a linked property with authorized fresh exact-price data returns `VERIFIED` and a match for listing ID, dates, guest count and currency.
- Confirm a linked property without a verified quote returns `DIRECT_UNAVAILABLE` without a numeric savings amount.
- Ensure no public page retrieval unless explicitly authorized.

Production evidence at review: 26 active external calendar connections had matching numeric listing IDs; zero fresh matching price quotes were found in cache. Thus real connected-property direct numbers cannot be confirmed until an authorized quote collector succeeds.
