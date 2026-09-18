# Find A Place — Operations, Host Tools & Editable Content Pass

This pass is intentionally isolated from the working Stripe booking engine.

It DOES NOT modify:
- `app/api/booking/hold/route.ts`
- `app/api/booking/payment-intent/route.ts`
- `app/api/booking/status/route.ts`
- `app/api/stripe/webhook/route.ts`
- `lib/payments/booking-runtime.ts`
- `lib/payments/stripe-checkout.ts`
- the canonical Stripe destination-charge split
- reservation confirmation/payment RPCs from migration 023

## What this adds

### Admin booking support
- Search, filter and sort `/admin/reservations`
- Reservation support detail page
- Guest/host/property/payment/ledger/event/message/review visibility
- Internal admin-only support notes
- Updated admin overview with booking lookup

### Host booking tools
- Reservation detail screen
- Booking-linked host/guest messages
- Host review visibility and response
- Real Messages page backed by reservation messages

### Guest post-booking tools
- Secure trip page using the existing guest checkout token
- Guest-host messaging
- Verified review submission after checkout
- Confirmation page link to secure trip page

### Policy PDF versioning
- Host can upload a PDF from the property editor
- New upload creates a new version instead of deleting history
- Current PDF appears on public listing
- New reservations snapshot the current policy-document reference through a DB trigger
- Booking/payment code itself is untouched

### Host images
- Primary avatar remains unchanged
- Host account can also keep up to 6 additional profile/gallery photos

### Reviews
- One verified review per completed reservation
- Public property rating/review display
- Host response support
- Admin reservation support view includes the review

### About / public content
- `/about`
- Legacy `/who-we-arewhat-we-do` redirects to `/about`
- About framing follows the original Find A Place community/outdoor identity
- Admin → Site content can edit selected Homepage and About sections
- Homepage layout stays the same; only selected copy is database-driven

## Apply

1. Extract this ZIP into the repository root and replace matching files.

2. Run the new Supabase migration:

`supabase/migrations/20260917002400_operations_content_host_tools.sql`

3. Clear generated Next cache after adding routes:

```powershell
Remove-Item -Recurse -Force .next
```

4. Validate before running:

```powershell
npm run typecheck
npm run build
```

5. Then:

```powershell
npm run dev
```

## Smoke test

Do NOT create another payment just to test this pass.

Use the reservation that already confirmed to verify:
- Admin → Reservations can find/open it
- Host → Reservations can open it
- Host → Messages loads
- Existing confirmation link can open the secure Trip page

For PDF:
- Host → Properties → property
- upload a small PDF
- refresh public listing and open the PDF link

For content:
- Admin → Site content
- edit a Homepage or About block
- save and refresh the public page

For reviews:
- The review form only appears after the reservation checkout date.
- For current future-dated sandbox bookings, messaging can be tested now; review submission stays correctly locked until after checkout.
