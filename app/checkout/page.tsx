import Link from "next/link";
import { Brand } from "@/components/Brand";
import { properties } from "@/data/demo";

function nightsBetween(checkin: string, checkout: string) {
  const start = new Date(`${checkin}T12:00:00`).getTime();
  const end = new Date(`${checkout}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ stay?: string; checkin?: string; checkout?: string; guests?: string }> }) {
  const params = await searchParams;
  const p = properties.find(x => x.slug === params.stay) || properties[0];
  const checkin = params.checkin || "2026-09-18";
  const checkout = params.checkout || "2026-09-21";
  const guests = params.guests || "4";
  const nights = nightsBetween(checkin, checkout);
  const cleaning = 75;
  const taxes = Math.round((p.price * nights + cleaning) * 0.09);
  const total = p.price * nights + cleaning + taxes;
  const confirmHref = `/booking/confirmed?stay=${p.slug}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`;
  return (
    <main className="checkout-page">
      <header className="checkout-header shell"><Brand /><Link href={`/stays/${p.slug}`}>← Back to stay</Link></header>
      <div className="checkout-shell shell">
        <section className="checkout-form">
          <div className="checkout-trust"><span>Secure checkout</span><span>Reservation held for 09:42</span></div>
          <h1>Complete your reservation.</h1>
          <p className="checkout-intro">Book as a guest or save your trip afterward. Your reservation, receipt and host information stay together in Find A Place Booking.</p>
          <div className="form-section"><div className="form-title"><span>1</span><div><h2>Your details</h2><p>We’ll use these for the confirmation and stay information.</p></div></div><div className="field-grid"><label><span>First name</span><input defaultValue="Jordan" /></label><label><span>Last name</span><input defaultValue="Walker" /></label><label className="full"><span>Email</span><input type="email" defaultValue="jordan@example.com" /></label><label className="full"><span>Phone</span><input defaultValue="(501) 555-0184" /></label></div></div>
          <div className="form-section"><div className="form-title"><span>2</span><div><h2>Payment</h2><p>Choose a wallet or pay securely by card.</p></div></div><div className="payment-demo"><div className="wallet-row"><button type="button">Apple Pay</button><button type="button">Google Pay</button></div><div className="or"><span/>or pay with card<span/></div><label><span>Card number</span><div className="fake-field">4242&nbsp;&nbsp;4242&nbsp;&nbsp;4242&nbsp;&nbsp;4242 <b>VISA</b></div></label><div className="field-grid"><label><span>Expiration</span><div className="fake-field">09 / 29</div></label><label><span>Security code</span><div className="fake-field">•••</div></label><label className="full"><span>Name on card</span><div className="fake-field">Jordan Walker</div></label></div><small>Card details are encrypted and securely processed. Find A Place Booking does not store full card numbers.</small></div></div>
          <div className="form-section"><div className="form-title"><span>3</span><div><h2>Host terms</h2><p>Policies stay specific to the property you are booking.</p></div></div><label className="checkline"><input type="checkbox" defaultChecked/><span>I agree to {p.hostName}’s cancellation policy, house rules and rental terms.</span></label></div>
          <Link className="button button-full checkout-pay" href={confirmHref}>Reserve and pay ${total}</Link>
          <p className="payment-foot">Presentation checkout · this button does not create a live charge.</p>
        </section>
        <aside className="checkout-summary"><img src={p.image} alt={`${p.name} property`}/><div><p className="eyebrow dark">Your stay</p><h2>{p.name}</h2><span>{p.location}</span><div className="summary-dates"><div><small>Check in</small><strong>{formatDate(checkin)}</strong></div><div><small>Check out</small><strong>{formatDate(checkout)}</strong></div><div><small>Guests</small><strong>{guests}</strong></div></div><div className="price-breakdown"><p><span>${p.price} × {nights} {nights === 1 ? "night" : "nights"}</span><span>${p.price*nights}</span></p><p><span>Cleaning fee</span><span>${cleaning}</span></p><p><span>Estimated taxes</span><span>${taxes}</span></p><hr/><p className="total"><strong>Total</strong><strong>${total}</strong></p></div><div className="direct-note"><strong>Hosted by {p.hostName}</strong><p>The host controls this property’s rates, policies and payout account. Find A Place Booking provides the booking experience.</p></div></div></aside>
      </div>
    </main>
  );
}
