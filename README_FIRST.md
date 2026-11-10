# Find A Place Booking: New-host 25% introductory promotion

**Source inspected:** Find-a-Place-Booking/Find-A-Place-Booking `main`, 2026-11-09.  This is an **overlay patch, not a live deployment**. GitHub/Vercel write access was denied from this chat.  Production database was **inspected read-only**, not changed.

## What the patch does

- Host Setup and Host Dashboard > Marketing & Promotions (existing partner-status display retained): a host-owner-only **opt-in checkbox** for a host-funded **25% reduction to lodging** for the first three eligible direct bookings **per primary published property**. Existing confirmed bookings count against the three, so older listings with three or more confirmed bookings do not re-qualify. New properties added after opt-in can participate automatically.
- If opted in, reveal a separate dropdown: **Would you like additional advertising from Find A Place?** No / Yes. If Yes, require a contact email. Saving queues a private, branded Resend notification to **Gez and Renea**, with reply-to set to the host email. It doesn't authorize spending, change fees or sign anyone up for paid advertising.
- The automatic FAP25 promotional codes are hidden from regular host-managed promo forms so hosts cannot accidentally edit them; the program is controlled from Marketing.
- Participating listings show **New host special · 25% off** on search cards and stay detail pages, with remaining offer count. The guest gets the corresponding discount during initial checkout preview and holds. Promo entry remains available for other codes; an explicitly typed code overrides the introductory promotion.
- Uses **existing** `promotion_codes` and `promotion_reservations` tracking, cap and reservation holds. Promo is limited to lodging; cleaning fees, other charges and taxes follow the existing pricing pipeline. No Stripe or iCal/PMS files are changed.
- Uses named system promotion codes, max 3 redemptions, never resets redemption history on toggling off/on. Availability indicators exclude active reserved holds, so offers disappear when no redemption capacity is available.

### Important product assumptions

- **Per property**, not three total across the host's entire account. The introductory offer applies to the primary rentable unit used for published search results. Other separately priced units need their own future configuration.
- “First three” means the **first three booked offers** through FAP, not the first three nights of a reservation. Historical confirmed bookings reduce the capacity; cancellations and refunded bookings may still count as historical confirmed reservations depending on current status.
- This is funded by the **host's lodging discount**. The platform still uses its existing commission calculation. No discounted fee payer/escrow/tax changes.
- Existing published listings with 3+ confirmed bookings do not qualify. No invented 30-day arbitrary new-host cutoff. If you require a strict signup-age threshold, that is a future product rule.
- Hosts opting out stop *future* discounts; existing paid reservations and past discounts are unaffected. The marketing opt-in is separate from Find A Place's partner-status and subscription access.

## Installation order: database FIRST, then code

0. **Back up** your local repository and your Supabase database. Do not use on unrelated projects. If your repo changed since 2026-11-09, verify first; the patcher fails closed if anchors don't match.
1. Extract this ZIP into the **root** of your existing Find-A-Place-Booking repo (alongside `package.json`). The folder structure `source/` inside the ZIP is intentional; the patcher copies files after preflight.
2. **Apply the new SQL migration** `source/supabase/migrations/20261110050000_new_host_intro_25_three_stays.sql` to the **FAP** Supabase environment, using your normal migration process (or, if using Supabase SQL Editor, apply it once and make sure the project migration record is synchronized). The SQL adds only an opt-in preference, a private advertising email queue, public offer-status read function, host-owned update RPC and optional unit-creation trigger. No existing guest booking functions are replaced.
3. In your repo root, with `apply_overlay.py` and `source/` extracted there, run `python apply_overlay.py` or double-click `APPLY_OVERLAY.bat` (Windows). It checks all anchors before any write and places timestamped backups **outside the repo**.
4. Run `npm run typecheck`, `npm run build`, and `node tests/test_intro25.cjs`.
5. Run a **Stripe test-mode checkout** as a new opted-in host: check quote preview, hold, booking, promo redemption count, offer label and remaining capacity after each paid booking; test simultaneous checkout attempts for the third redemption. Repeat with a non-participating host, another manual promo, a canceled booking, and a listing with 3 existing confirmed bookings.
6. Test notifications: opting into extra advertising with an email should send a branded email to Gez and Renea. With Resend unavailable, the saved request should remain `FAILED` for retry, not falsely show `SENT`. Save again to retry. Ensure `RESEND_API_KEY` and `EMAIL_DOMAIN` already work for your existing transactional emails.
7. Review your local `git diff`, commit the changed files and push through your existing Vercel process. Verify live public cards, mobile results, property pages, checkout, and host dashboard **after deployment**.

**Do not publish the advertising badge until the new SQL has been applied**, otherwise no offer will be returned. On older databases the public-offer lookup safely returns no offers, but the host marketing form won't save until the RPC exists.

### Verification and known limitations

- New TypeScript/TSX modules were transpile-checked in isolation. A **full Next.js typecheck/build cannot be verified from this chat**, as the entire checkout repository is not mounted here.
- The database migration **has not been executed** in production. The SQL is intended for review and application with your deployment plan. Test against a clone/staging database before production if possible.
- The active FAP Supabase project was inspected read-only to confirm the existing promotion schema, three-stay counters, owner permissions, Resend conventions, and verified Gez/Renea admin emails.
- `FAP25-...` codes are system-managed. The overlay hides them from the regular Rates promo-code editor, but an API-level change is still possible for highly privileged actors; the public badge fails closed unless the code remains a correct 25% offer.
- This patch intentionally avoids modifying global fee settings, payment capture, cancellation, Stripe Connect transfers, availability sources, iCal/ResNexus/ThinkReservations sync, or tax calculations.
