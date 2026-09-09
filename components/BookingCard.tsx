"use client";

export function BookingCard({ price }: { slug: string; price: number; rating: number }) {
  return (
    <aside className="booking-card booking-card-disabled">
      <div className="booking-price"><strong>${price}</strong><span>/ night</span><b>Published listing</b></div>
      <div className="availability-note"><span>●</span><strong>Booking is not active yet</strong></div>
      <div className="booking-dates">
        <label><span>Check in</span><input type="date" disabled /></label>
        <label><span>Check out</span><input type="date" disabled /></label>
        <label className="full"><span>Guests</span><select disabled><option>Guests</option></select></label>
      </div>
      <div className="price-breakdown"><p><span>Nightly lodging</span><span>Published host rate</span></p><p><span>Availability</span><span>Calendar connection comes next</span></p><p><span>Checkout</span><span>Safely disconnected</span></p></div>
      <button className="button button-full" type="button" disabled>Reservations open after calendar testing</button>
      <small className="secure-note">This property is public for marketplace testing, but no dates, holds, charges or real-money transactions can be created yet.</small>
    </aside>
  );
}
