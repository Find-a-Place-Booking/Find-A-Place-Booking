Find A Place Booking — Guest Reviews Finalized

This ZIP is cumulative with the previous property enable/disable package.

WHAT IS NOW COMPLETE

GUEST SIDE
- Review access opens only after checkout for a CONFIRMED reservation.
- A secure My Trip token is still required.
- Guest writes a review (minimum 10 characters, max 4000).
- Guest must choose a 1–5 star rating.
- Rating uses an actual clickable five-star control instead of a select menu.
- One review per reservation remains enforced by the database unique constraint.
- Review is labeled as a verified stay because it can only be created from the
  reservation's secure My Trip access.
- Submitted review becomes read-only to the guest.
- Host response appears back in My Trip if one is posted.

PUBLIC LISTING
- Published reviews continue to feed the property's average rating.
- Property pages now render review stars, review text, guest name, date and
  optional host response in a proper review layout.
- Existing AggregateRating structured data remains in place for properties with
  reviews.
- Homepage/stays/property paths are revalidated immediately after a new review.

HOST SIDE
- Added Reviews to desktop and mobile host navigation.
- New /host/reviews page shows:
  - average rating
  - published review count
  - reviews awaiting a host response
  - review text, stars, guest name, date and property
- Hosts can post or update a PUBLIC RESPONSE to a guest review.
- Hosts cannot edit the guest's rating, review text or publication status.

SECURITY / INTEGRITY HARDENING
The old RLS policy allowed a property manager to UPDATE the whole
reservation_reviews row. That meant a sufficiently technical host could have
attempted to modify guest review data directly.

Migration 20260923194817 removes that broad host update path.
- direct reservation_reviews UPDATE is now admin-only
- hosts respond through public.host_respond_to_review()
- the RPC checks can_manage_property()
- it only changes host_response fields
- the response is audit logged

LIVE DATABASE
Migration 20260923194817 finalize_guest_reviews has ALREADY been applied to the
current production Supabase project.

NO BOOKING / PAYMENT CHANGES
This does not change:
- Stripe processing
- commissions
- taxes
- booking holds
- calendar logic
- payouts
- refunds
- reservation confirmation

RECOMMENDED TEST
1. Use a confirmed test reservation whose checkout date is today or earlier.
2. Open My Trip using its secure reservation link.
3. Confirm the review form is visible near the top of My Trip.
4. Write 10+ characters and choose 1–5 stars.
5. Submit.
6. Confirm a second review cannot be submitted.
7. Open the public property and confirm the review/stars appear.
8. Open Host > Reviews.
9. Post a host response.
10. Confirm the response appears on the public property and in the guest's My Trip.
11. Confirm a future/uncompleted reservation only sees "Review access opens after checkout."
