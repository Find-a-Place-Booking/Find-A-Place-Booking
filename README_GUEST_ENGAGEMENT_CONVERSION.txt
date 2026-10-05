Find A Place Booking — Guest Engagement / Conversion Pass

PURPOSE
This is an additive guest-experience pass. It does not redesign the site or
change the booking architecture. It keeps the existing Find A Place visual
language and adds the specific engagement/conversion improvements discussed.

WHAT IT ADDS

1. Persistent saved stays
- Hearts now persist on the guest's device with localStorage.
- Save state stays synchronized between search cards, the stay page and header.
- New /saved page shows the guest's current saved public listings.
- Header shows Saved with a count.
- Mobile menu includes Saved stays.
- No login is required.
- Saved listings are refreshed from current public data when /saved opens.
- A maximum of 50 slugs is stored locally.

2. Stronger stay cards
- Existing host-curated Nearby Experiences can now be surfaced on search/result
  cards, not only homepage cards.
- The strongest/first nearby experience is teased directly in the card body with
  real saved miles/drive time when available.
- Guest-facing standout amenities are prioritized in the visible three tags
  (waterfront, hot tub, ATV access, views, pet friendly, fireplace, deck, fire
  pit) before generic amenities.
- Date-filtered search cards get the precise cue "Calendar open for these dates".
- No fake scarcity or fake "people are viewing" messaging.

3. Estimated trip total before checkout
- When a guest selects dates on a listing, the BookingCard first rechecks the
  selected range against the existing live availability endpoint.
- The Reserve button does not enable until this check returns valid, or the
  extra reassurance check itself is unavailable and the normal authoritative
  hold will recheck it.
- The listing then calls the EXISTING read-only /api/booking/estimate endpoint.
- Shows current lodging, required fee lines, taxes and estimated total.
- Clearly says optional extras/pets are not included in this early estimate.
- If the host self-remits taxes, it tells the guest host-handled taxes may be
  additional.
- Final pricing is still shown again in checkout.
- The actual reservation hold remains the authoritative availability check.
- No reservation, hold, payment, Stripe or tax-calculation path is changed.

4. Keep guests browsing
- Bottom of each stay page can show up to 3 relevant "More from this host"
  listings.
- Can also show up to 3 "More stays worth a look nearby" listings.
- Same-host recommendations are ranked by same city/public area/type.
- Nearby recommendations use the existing guest-safe public map coordinates
  and a <=75-mile geographic radius when coordinates are available.
- A same-host listing is never duplicated into the nearby group.
- Recommendation work is streamed below the main listing content with Suspense,
  so it does not block the core listing/calendar/booking page.

5. Availability language
- Search pages with valid check-in/check-out input now say "Calendar checked for
  these dates".
- Individual cards say "Calendar open for these dates".
- The listing booking card performs the more exact stay-rule/minimum-night check
  before saying the selected range is available.
- The real hold still checks availability again before checkout.

RESPONSIVE / STYLE SAFETY
- Existing property-card image dimensions are NOT changed.
- Existing gallery/image sizes are NOT changed.
- Existing core globals are NOT replaced.
- New visual additions are scoped to CSS modules where possible.
- Recommendation grids: 3 columns desktop, 2 tablet, 1 mobile.
- Saved page: 3 columns desktop, 2 tablet, 1 mobile.
- Header Saved action becomes compact at tighter desktop/tablet widths and uses
  the existing mobile drawer on phones.
- No modal/popup capture, fake urgency or intrusive email prompt was added.

CORE SYSTEMS NOT CHANGED
- No Supabase migration.
- No Stripe changes.
- No booking-hold changes.
- No checkout routing changes.
- No payment-intent changes.
- No tax-engine changes.
- No calendar sync/PMS/iCal changes.
- No host onboarding changes.
- No image upload or image sizing changes.

PREREQUISITE / MERGE NOTE
The replacement Header.tsx intentionally preserves the already-built
"Meet the hosts" link from the public host-directory overlay. This engagement
overlay should be applied after the host-directory/profile UI work already in
your local branch. The separate public_host_slug database migration is still
required for actual public host profiles to populate; this overlay does not
duplicate that migration.

FILES
New:
- app/api/public/saved-stays/route.ts
- app/saved/page.tsx
- components/BookingCardEnhancements.module.css
- components/GuestStayRecommendations.module.css
- components/GuestStayRecommendations.tsx
- components/PropertyCardEnhancements.module.css
- components/SavedStayNavLink.module.css
- components/SavedStayNavLink.tsx
- components/SavedStaysClient.module.css
- components/SavedStaysClient.tsx
- lib/client/saved-stays.ts
- lib/public/recommendations.ts
- lib/public/stay-cards.ts

Full replacements:
- app/stays/[slug]/page.tsx
- app/stays/page.tsx
- components/BookingCard.tsx
- components/Header.tsx
- components/PropertyActions.tsx
- components/PropertyCard.tsx
- components/SaveStayButton.tsx
- components/StayResults.tsx

DOUBLE-CHECKS PERFORMED
- All overlay .ts/.tsx files parsed with TypeScript 5.8.3: 0 syntax diagnostics.
- All overlay CSS files checked for balanced braces: 0 diagnostics.
- Checked for merge-conflict markers / TODO leftovers: none.
- Verified the live Supabase schema contains the public_listing_index,
  public_listing_map_coordinates and quote_guest_checkout_estimate RPCs used by
  these additions.
- Verified the live properties/nearby-experiences columns referenced by the
  recommendation logic exist.
- Verified Fancy Hill has multiple published stays and Lil' Rustic currently has
  12 nearby experiences, so the same-host and experience-teaser paths have real
  current data to use.
- Confirmed this overlay does not add property/gallery image size overrides.

MANUAL SMOKE TEST AFTER DEPLOY
Desktop:
1. Open /stays with no dates. Confirm cards look normal and no false date cue.
2. Search with valid dates. Confirm returned cards say "Calendar open for these dates".
3. Open a stay. Confirm Save persists after refresh and header Saved count updates.
4. Open /saved. Confirm saved cards render and removing a heart removes the card.
5. Select valid dates on a stay. Confirm live-date check finishes, estimate appears,
   and Reserve enables.
6. Change dates/guest count. Confirm old total disappears immediately and refreshes.
7. Select an unavailable/invalid range if possible. Confirm Reserve remains disabled.
8. Scroll below reviews. Confirm More from this host / nearby cards render without
   changing the main listing layout.
9. Confirm the existing clickable Hosted by host profile still works.

Mobile:
1. Open mobile menu and confirm Saved stays appears and closes the drawer on tap.
2. Verify saved count / hearts stay synchronized after refresh.
3. Confirm result cards remain one column with no overflow.
4. Confirm the estimated-total box fits the booking card without horizontal scroll.
5. Confirm recommendation sections are one column and all tap targets remain usable.
6. Confirm no property/gallery image dimensions changed.
