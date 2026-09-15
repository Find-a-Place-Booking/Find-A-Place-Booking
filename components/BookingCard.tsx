"use client";

export function BookingCard({ price }: { slug: string; price: number; rating: number }) {
  return (
    <aside className="booking-card booking-card-disabled">
      <div className="booking-price"><strong>${price}</strong><span>/ night</span><b>Listed on Find A Place</b></div>
      <div className="availability-note"><span>●</span><strong>Online booking opens soon</strong></div>
      <div className="booking-dates">
        <label><span>Check in</span><input type="date" disabled /></label>
        <label><span>Check out</span><input type="date" disabled /></label>
        <label className="full"><span>Guests</span><select disabled><option>Guests</option></select></label>
      </div>
      <div className="booking-coming-soon"><strong>Save this one for later.</strong><p>Online dates and secure checkout will open soon.</p></div>
      <button className="button button-full" type="button" disabled>Online booking coming soon</button>
      <small className="secure-note">Nothing can be held or charged from this page yet.</small>
    </aside>
  );
}
