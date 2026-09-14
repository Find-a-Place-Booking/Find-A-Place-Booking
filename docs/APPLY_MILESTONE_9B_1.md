# Apply / Test Milestone 9B.1

Expected code baseline: `841d98c` (`Calander Initial Commit`). Migration 014 must already be applied.

## 1. Overlay files

Extract the 9B.1 ZIP into the repository root and allow the folders to merge.

## 2. Apply only migration 015

Run:

`supabase/migrations/20260914001500_calendar_hardening_performance.sql`

Do not rerun migrations 001–014.

## 3. Compiler/build gate

```powershell
npm run typecheck
npm run build
npm run dev
```

Expected health endpoint:

```json
{"ok":true,"service":"supabase","configured":true,"schema":"calendar-availability-hardening-v1"}
```

## 4. Calendar regression

1. Host -> Calendar still lists only the signed-in owner/manager's managed property/unit inventory.
2. Create and remove a manual owner block; checkout-exclusive date behavior must remain `[start, end)`.
3. Existing 9A rates, specials and minimum stays still render on calendar days.
4. If a normal discrete iCal feed is available, Connect & sync, Sync now, disconnect and source-isolation behavior must match 9B.
5. A feed with an unsupported RRULE must return a safe sync error and must not clear previously imported blocks.
6. General and source-specific outbound `.ics` URLs still resolve; long names/summaries should contain folded continuation lines beginning with one space.
7. Admin -> Calendars still shows source health, organization/property/unit ownership, counts and errors, but never displays the private source feed URL.

## 5. Security check

If a STAFF organization member test account exists, confirm it cannot query calendar connection/feed configuration or export tokens directly. OWNER/MANAGER and active Admin access must remain functional.

## 6. Whole-site speed/regression check

Recheck auth, onboarding, property editing, review/publication, public `/stays`, rates/fees, date rates, minimum stays, add-ons and promotion rules. Checkout/payment remains disconnected.

Also confirm the image-signing optimization did not change behavior:

- homepage renders the same first three published stays and cover images;
- `/stays` renders every published card cover;
- a public property detail still renders its gallery;
- Host -> Properties still renders cover thumbnails;
- host property editor still renders all stored images;
- Admin property detail still renders all stored images.

## 7. Checkpoint

After local typecheck/build/runtime acceptance:

```powershell
git status
git add .
git commit -m "fix: harden calendar sync privacy and performance"
git push origin main
git rev-parse --short HEAD
```

Use that hash as the accepted 9B.1 baseline before reservation/payment work.
