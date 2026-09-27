# Find A Place Booking — Primary Photo Selector UI Fix

This overlay replaces the earlier basic primary-photo control with a real selector.

Files:
- `components/PrimaryPhotoSelector.tsx`
- `components/PrimaryPhotoSelector.module.css`

Behavior:
- Shows every property photo as a selectable thumbnail.
- The current primary image is clearly labeled.
- Tapping/clicking another thumbnail selects it.
- A separate **Set selected as primary** button saves the choice.
- The database change is still only one `sort_order` update on the selected image.
- Nothing is deleted, re-uploaded, renamed, or moved in storage.
- The public listing already orders images by `sort_order, created_at`, so the chosen image becomes first/hero.

No database migration is required.
No Stripe, booking, calendar, tax, onboarding, payout, or property-upload logic is changed.

This overlay assumes the previous primary-photo overlay is already present, which it is on the current `main` branch.
