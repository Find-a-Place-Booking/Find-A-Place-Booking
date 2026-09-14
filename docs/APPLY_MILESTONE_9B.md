# Apply / Test Milestone 9B

> **Superseded for current development by Milestone 9B.1.** Use `docs/APPLY_MILESTONE_9B_1.md` after migration 014 is in place. After migration 015, the health schema is `calendar-availability-hardening-v1`.


Baseline expected before applying: `563fc11` (`update A9.1 Stuff`).

## 1. Overlay the files

Extract the Milestone 9B ZIP into the repository root so `app/`, `components/`, `lib/`, `docs/` and `supabase/` merge with the existing folders.

Do not delete the existing repository first. This package contains only 9B additions/replacements.

## 2. Apply the database migration

If migration 013 is already applied, run only:

`supabase/migrations/20260914001400_calendar_availability_ical.sql`

Do not rerun 011, 012 or 013.

## 3. Static/local gates

From the repository root:

```powershell
npm run typecheck
npm run build
npm run dev
```

Then open:

`http://localhost:3000/api/health/supabase`

Expected:

```json
{
  "ok": true,
  "service": "supabase",
  "configured": true,
  "schema": "calendar-availability-ical-v1"
}
```

## 4. Host acceptance

Open Host Dashboard -> Calendar.

1. Confirm the property/unit selector shows the correct host inventory.
2. Create an owner block for two nights. Example: start Sep 20, end Sep 22 means nights Sep 20 and Sep 21 are blocked; Sep 22 is checkout/open again unless another source blocks it.
3. Confirm the block appears on both nights and remove it again.
4. Confirm the calendar still shows the existing 9A nightly price, special badge and minimum-stay rule where applicable.
5. Connect a real test iCal/ICS URL. Airbnb/Vrbo or another public HTTPS iCal feed is fine.
6. Confirm first sync reports imported events and the connection becomes HEALTHY.
7. Press Sync now again. It should be idempotent rather than creating duplicate blocks.
8. If practical, remove/change one event at the source and sync again. Only stale events from that connection should be cleared.
9. Connect a second source or create an owner block overlapping an imported event. The UI should show the overlap warning; neither source should silently erase the other.
10. Disconnect one source. Its imported blocks should stop affecting availability while owner blocks/other source blocks remain.

## 5. Export acceptance

For a connected source, copy its Find A Place outbound feed URL and open it in a browser. It should return an `.ics` calendar.

The source-specific feed deliberately excludes events imported from that same source while retaining owner blocks, Find A Place reservations when those exist later, and blocks imported from other sources.

Generate the General iCal export and verify it also returns an `.ics` response. Rotate an export URL and verify the old token stops resolving while the new one works.

## 6. Admin acceptance

Open Admin -> Calendars.

Confirm:

- connected source count;
- HEALTHY / ERROR / NEVER SYNCED state;
- organization / property / unit ownership;
- active imported block counts;
- last successful sync;
- last error when applicable;
- link back to the related Admin property.

The Admin calendar screen is deliberately read-only in 9B.

## 7. Regression pass

Before accepting 9B, recheck:

- host auth/sign-out;
- Admin auth and property review/publication;
- published property remains on `/stays` and the homepage where applicable;
- Rates & Fees base pricing;
- date-specific rates;
- minimum-stay rules;
- add-ons;
- promo codes and 9A.1 stacking rules;
- public listing still has booking/checkout disabled;
- no Stripe/Square call exists in the calendar milestone.

## 8. Checkpoint only after acceptance

```powershell
git status
git add .
git commit -m "feat: add canonical availability and iCal calendar foundation"
git push origin main
git rev-parse --short HEAD
```

Keep the resulting hash as the accepted 9B baseline before starting payment processing.
