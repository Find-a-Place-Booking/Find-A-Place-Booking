# Find A Place after-push triple QA checklist

## Pass 1 — static and deploy
- [ ] Connected production Supabase already prepared: confirm new tables/RLS and both new feature flags OFF.
- [ ] Automatic source integration and original-logo recoloring show success during `npm run build`; `npm ci`, `npm run typecheck`, `npm run build` clean.
- [ ] No Vercel 500s on homepage, /stays, /stays/[slug], /checkout, /host/sign-up, /admin/content.
- [ ] Host and guest PWAs install with different forest-green vs rust-orange icons on Android; check Apple touch icons on iPhone.

## Pass 2 — actual user workflows (safe mode)
- [ ] Renea host signs in, edits one property's details; other properties and experiences unaffected.
- [ ] Melissa's Barn House Saturday arrival/departure not allowed; a valid permitted arrival/departure pair works, holiday overrides preserved.
- [ ] Melissa's Barn House OwnerRez iCal remains healthy and Creeks Edge remains DRAFT until finished.
- [ ] `Copy setup` makes a new DRAFT, keeps rules/amenities/rates, never copies address/photos/calendar/reservations/taxes/payment links.
- [ ] Add $0 inactive optional extra then assign price and activate; guest sees only after activation.
- [ ] Host video: valid MP4, 75 MB/60-sec limits, first upload, replace, remove, mobile Android/iPhone, media page playback; verify Kelby's existing video never disappears on failed replacement.
- [ ] Signup uses current live agreement version; guest-paid 7% checkout disclosure and old booking fee snapshots unchanged.
- [ ] Renea saves a terms draft; public site stays unchanged; preview, confirm publish; policy version increments; subsequent host signup records newest version.

## Pass 3 — flags on in test only
- [ ] E-sign: host uploads new policy/rental PDF; guest cannot pay without reviewing and typing legal name + explicit consent; save signature linked to correct PDF version; prior completed bookings unaffected.
- [ ] Deposit: host enables $1 TEST-only policy; new guest sees disclosure before lodging payment; booking confirms; ledger snapshots correct amount and terms.
- [ ] Guest pays deposit separately to host Stripe Connect account: `application_fee_amount` absent or zero, tax 0; reservation lodging charge unaffected.
- [ ] Stripe signed webhook marks deposit PAID and does not accidentally invoke `confirm_reservation_payment` twice.
- [ ] After test checkout date, host triggers full refund, Stripe refund webhook updates REFUNDED; no platform-fee reversal or guest lodging refund.
- [ ] Duplicate deposit intent requests return same Stripe PI. Duplicate refund requests return same Stripe refund (idempotency).
- [ ] Failed payment and dispute events safely recorded; original booking remains confirmed.
- [ ] Guest My Trip shows accurate deposit status; host sees guest signature and the original agreement PDF.

**Only enable LIVE after all required test results pass.** Do not test charges on real guests or live cards.


## Required standard custom fee regression checks

1. On host Rates & fees, open a property and scroll just under **Normal nightly rate & standard fees**. Confirm the **Custom host fees** section is visible and host-authenticated only.
2. Create a $25 **Linen fee**, once per stay. Check its name and $25 appear automatically in quote preview and on guest checkout **without a checkbox or optional selection**. Confirm the fee is excluded from Find A Place's lodging-based service-fee calculation.
3. Change the same fee to $10 per night; a three-night stay must show $30. Confirm applicable lodging taxes use the property tax configuration.
4. Create another fee with the amount blank; it must remain inactive and never appear in guest quotes. Activate with a price, then turn it off and verify the fee disappears from new checkout quotes.
5. Test per-guest and per-pet fee modes. Changing the guest/pet count should adjust only the appropriate fees.
6. Confirm an unrelated property's quote and an existing reservation remain unchanged. Confirm a host cannot edit another organization's custom fees.
7. Remove a fee and verify it no longer appears in fresh quotes. Existing paid reservation snapshots must remain unchanged.
8. Leave **optional guest extras** in their original guest-selected flow. Do not mistake mandatory custom fees for add-ons.
