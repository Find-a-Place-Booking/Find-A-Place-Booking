# Milestone 8 Cleanup — Admin Navigation + Consistency Audit

Start from the accepted/pushed Step 8 checkpoint:

`00bb71d` — `feat: add property review and publication foundation`

This cleanup has **no new Supabase migration** and **no new npm dependency**.

## Changes

- Admin overview metric cards are redundant navigation targets:
  - Host profiles → `/admin/hosts`
  - Organizations → `/admin/hosts` (current combined host/org lookup)
  - Properties → `/admin/properties`
  - Listing reviews → `/admin/properties?status=PENDING_REVIEW`
  - Published → `/admin/properties?status=PUBLISHED`
  - Partner requests → `/admin/partners` only for roles that can manage partner verification
  - Audit events → `/admin/audit`
- Metric cards have hover/focus states and preserve keyboard-accessible links.
- Admin metric-grid CSS was consolidated to remove competing 5-column/4-column definitions.
- User-facing copy left over from earlier development milestones was updated so the UI describes current capabilities instead of internal milestone numbers.
- Public listing-card image signing now signs only the three images the index card can use; listing detail still supports the full gallery.
- No review/publication/security/payment/calendar behavior was expanded.

## Local checks

Run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Then verify:

1. `/admin` — every applicable metric card is clickable and goes to the correct view/filter.
2. Admin metric cards still lay out cleanly at desktop, ~1000px, tablet and phone widths.
3. Partner requests is not an actionable card for an Admin who lacks partner-management roles.
4. `/admin/properties?status=PENDING_REVIEW` and `?status=PUBLISHED` filter correctly.
5. Host property submit → Admin request changes → host resubmit → approve → publish still works.
6. Published listing is visible signed-out; non-published states remain private.
7. Host property images/avatar still load and persist.
8. Host/public pages no longer show stale internal milestone instructions.
9. Auth separation, partner verification, audit log and mobile navigation still work.
10. `/api/health/supabase` remains `property-review-publication-v1`.

## Checkpoint

After acceptance:

```powershell
git add .
git commit -m "chore: clean up Step 8 admin navigation and UI copy"
git push origin main
git rev-parse --short HEAD
```

Use that new hash as the baseline for Milestone 9.
