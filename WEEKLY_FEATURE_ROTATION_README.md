# Weekly Homepage Feature Rotation

This is an incremental patch for the existing 1 / 2 / 3 homepage-feature
priority system.

## Behavior

Priority order is still:

1. **Founding partner**
2. **Paid placement**
3. **Standard**

The hierarchy does **not** change.

What changes is the order *inside* priority 1 and priority 2.

Every Monday, Find A Place automatically rotates the starting property in each
premium priority band. This means:

- founding-partner properties take turns in the top/hero positions
- paid-placement properties take turns in the paid-priority positions
- a large group of premium properties can rotate into the visible homepage
  slots over successive weeks
- standard priority 3 inventory remains the fallback after all 1s and 2s

The homepage hero uses the first item from this ordered list, so when multiple
priority-1 properties exist, that hero property rotates weekly as well.

## No scheduler required

There is no cron job and no database update every week. The server calculates a
stable weekly rotation index from the current **America/Chicago** calendar week.

All requests during the same Monday-Sunday week produce the same order. The
order changes automatically when the next Central-time Monday begins.

## Scope

Only:

`lib/public/listings.ts`

is changed.

No Stripe, payment, webhook, commission, refund, booking, tax or calendar
logic is touched.

## Apply

Apply the earlier homepage feature-priority overlay first (migration 066), then
extract this overlay over the project and run:

```powershell
npm run typecheck
npm run build
```

There is no additional database migration for weekly rotation.
