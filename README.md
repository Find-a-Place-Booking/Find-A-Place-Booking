# Find A Place Booking — Set Primary Photo Overlay

Files:
- `app/host/properties/[slug]/page.tsx`
- `components/PrimaryPhotoSelector.tsx`

What it does:
- Adds a host-facing **Set as primary** option for every non-primary property photo.
- The selected photo becomes first by changing only that image's `sort_order`.
- No photo is deleted, moved in storage, or re-uploaded.
- Works for editable draft, published and paused listings.
- Public listing functions already order images by `sort_order, created_at`, so the new primary photo becomes the hero/cover everywhere that uses the normal listing image order.

Safety:
- No Stripe, booking, tax, calendar, payout, onboarding, or storage code is changed.
- No database migration is needed.
- Existing `property_images` UPDATE RLS still controls whether the host may change the row.
- The update targets both the image ID and the current unit ID.
- The current property page source was verified against GitHub blob `772e876faa441878a0dcef1c3b8403b151857f0b` before the overlay was produced.
