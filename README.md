# Find A Place Booking — Individual Special Offer overlay

Applies only to admin reservation UI and uses the existing host recovery emails, guest offer page and promotion-code storage. No schema migration; no modifications to payments, taxes, checkout or calendar code.

## Important: Installation takes TWO steps

1. **Extract the contents of this ZIP over the existing Find A Place Booking repository root**, preserving the directories. New files go under `app/admin/reservations/[reservationId]/offer`, `lib/bookings` and `components`.
2. **Run `APPLY_OVERLAY.bat` once on Windows**, or `python3 apply_special_offer_overlay.py .` from the repository root on macOS/Linux. This is REQUIRED to add the **Send special offer** links to the two existing admin reservation screens. Merely uploading/extracting the ZIP does not modify those existing pages.
3. `npm run typecheck` and `npm run build`. Do not push if either fails.
4. Commit and push. Vercel will deploy as usual. **Do not email real guests for testing.** First open an eligible reservation in admin, confirm the preview/eligibility before sending any offer.

## What changes

- `app/admin/reservations/page.tsx`: existing clickable booking rows preserved, small Send special offer link below eligible unfinished rows, only for managed properties.
- `app/admin/reservations/[reservationId]/page.tsx`: a contextual offer card above financial metrics for eligible bookings.
- New `app/admin/reservations/[reservationId]/offer/page.tsx`: branded admin review page with original booking total, lodging subtotal, guest and dates, and 5/10/15/20% discount options.
- New action and server-only offering service: verifies active admin session AND actual management permission, published property, live environment, open future stay dates, guest email, payment not succeeded/processing, active recovery settings and email opt-out status. Confirms availability via the existing fail-closed calendar check before sending.
- One-use 48-hour fixed-amount code based on ORIGINAL lodging price only, with the existing branded recovery email and its unsubscribe link. The guest clicks the existing recovery-offer page, copies the code and checks out through unchanged pricing/payment/calendar flows.
- One offer per email+unit+date range: reuses the existing uniqueness constraint and notification dedupe; earlier sent offers are blocked and records do not get bulk-email campaigns.

## Operational notes

- No guests are contacted during installation.
- Only an active, signed-in admin who can manage the property can send a manual offer. An admin viewing another host's booking cannot discount it.
- The feature requires Booking recovery enabled for that property and discount follow-ups not set to OFF.
- The offer is **not a booking**, and availability is not held by sending it. The final checkout price can change if taxes/rates/extra charges change; the discount remains a fixed dollar amount based on the guest's original lodging.
- No new database tables or environment variables required, as long as the existing recovery email system and Resend settings work.
- The overlay does not alter the pre-existing automatic booking-recovery job.
- The selected host owns the discount (same promotion-code ownership as the existing host recovery feature).

## Source files included

- `app/admin/reservations/[reservationId]/offer/page.tsx` (new)
- `app/admin/reservations/[reservationId]/offer/actions.ts` (new)
- `components/AdminRecoveryOfferForm.tsx` (new)
- `lib/bookings/manual-targeted-offer.ts` (new)
- `apply_special_offer_overlay.py` (one-time guarded patch of two existing pages)
- `APPLY_OVERLAY.bat` (Windows one-click runner)

The patcher checks every insertion point BEFORE modifying either existing file and is idempotent. If the source files no longer match these anchors, it stops without changing them rather than overwriting newer work.
