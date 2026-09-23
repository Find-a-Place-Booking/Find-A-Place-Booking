# Homepage Featured Stay Priority

Built against GitHub main commit:

`2d747cba2e20a96040a6ffc54a81fa0de2e3b30d` — Jasper Added

## Priority model

Each property gets one internal value:

- **1 — Founding partner**
- **2 — Paid placement**
- **3 — Standard**

Existing and future properties default to **3**.

Lower numbers appear first in the homepage inventory. The existing ordering is
preserved inside each priority band, so this adds only the 1 → 2 → 3 rule.

## What changes

### Admin → Properties

Every property row now shows a compact **Homepage priority** control. Operations
and Super Admin can assign 1, 2 or 3 and save it directly from the property
inventory screen.

Every change is audit logged.

### Homepage

The homepage currently calls `getPublishedProperties(14)`. Numeric/limited
homepage inventory now automatically uses the feature-priority ordering before
the limit is applied.

That means:

1. Priority 1 properties fill the first featured positions.
2. Then priority 2 properties.
3. Then priority 3 properties.

The very first property is also the existing hero "Featured stay", so the same
priority system controls that position too.

### Search/browse pages

Normal `/stays` search does **not** use homepage feature priority. Search remains
based on the existing public inventory + destination/filter logic.

This prevents paid/founding homepage placement from silently changing normal
guest search results.

## Important

This is intentionally **property-level**, not organization-level. That lets Find
A Place decide which specific cabin/property gets the placement even when one
host owns several listings.

No Stripe, payment, webhook, commission, refund, calendar, tax or booking route
files are changed.

## Apply

```powershell
npx supabase db push
npm run typecheck
npm run build
```

New migration:

`20260922006600_homepage_feature_priority.sql`
