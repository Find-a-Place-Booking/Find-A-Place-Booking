# Apply Milestone 3.5 — UI/UX Stabilization

This milestone must be applied **over the verified Milestone 3 repository**. Do not initialize a new Git repository and do not replace the existing `.git` directory or local `.env.local`.

Known-good starting checkpoint:

`43dbf81` — verified Milestone 3 Supabase foundation

## Scope

Milestone 3.5 intentionally changes presentation and local interaction only. It does not add authentication, property persistence, bookings, payments, calendar sync or new Supabase migrations.

Primary changes:

- mobile navigation for the public site, host portal and admin workspace;
- expanded host onboarding structure with simplified checkbox/selection flows;
- structured amenities and policy groups;
- exact property location/capacity UI required by future map/tax/search work;
- partner-status claim and pending-verification UI;
- cleaner rates/fees, calendar and payout setup presentation;
- local photo-selection preview for UI testing only;
- responsive review/summary flow;
- explicit partner-verification area in admin;
- cleaner empty-state map treatment while the real interactive map remains a later subsystem.

## Apply

1. Keep your current repository and `.git` folder.
2. Copy the contents of this package over the existing repository, replacing changed source/docs files.
3. Preserve your existing `.env.local` and `package-lock.json`.
4. No Supabase SQL needs to be applied for this milestone.

## Local acceptance gate

Run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Then test at desktop width and a narrow mobile width (roughly 390–430px).

### Public

- `/`
  - desktop navigation still looks correct;
  - mobile hamburger opens/closes cleanly;
  - mobile menu links are usable;
  - search fields do not overflow;
- `/stays`
  - filters can scroll horizontally on mobile;
  - results/empty state remains readable;
  - map section does not pretend sample geography is live inventory.
- `/hosts`
  - host sales page remains readable and buttons are reachable on mobile.

### Host

- `/host`
  - desktop sidebar still works;
  - mobile Host menu exposes every host route;
- `/host/onboarding`
  - move through all 11 steps;
  - typed values remain visible when moving backward/forward during the current session;
  - amenity groups expand/collapse and selections persist;
  - policy groups expand/collapse and selections persist;
  - conditional quiet-hours/pet/minimum-age controls appear only when their policy is selected;
  - selecting local photos creates previews without uploading anything;
  - partner Yes/No choice behaves correctly;
  - Yes shows pending-verification identification fields and explicitly keeps the rate at 7% until approval;
  - Review summarizes entered UI state;
  - mobile Back/Continue controls remain reachable without covering important fields.
- check the remaining host pages from the mobile menu for layout regressions.

### Admin

- `/admin`
  - desktop sidebar still works;
  - mobile Admin menu exposes the operational sections;
  - Partner Verification Requests section is visible and readable;
  - metrics/panels do not overflow narrow screens.

### Existing foundation regression

- `/api/health/supabase` must still return the same successful Milestone 3 result.
- No new database migration should exist in this milestone.
- No route should begin requiring authentication yet.

## Do not commit until

- typecheck passes;
- build passes;
- Supabase health still passes;
- desktop and mobile regression checks pass;
- no earlier verified flow is broken.

Then checkpoint:

```powershell
git status
git add .
git commit -m "refactor: stabilize production UI and mobile flows"
git push origin main
git rev-parse --short HEAD
```

Record that hash in `docs/PROJECT_STATE.md` before beginning Milestone 4.
