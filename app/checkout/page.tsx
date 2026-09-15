import Link from "next/link";
import { Brand } from "@/components/Brand";
import { properties } from "@/data/catalog";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ stay?: string }> }) {
  const params = await searchParams;
  const property = properties.find((item) => item.slug === params.stay);

  if (!property) {
    return <main className="checkout-page"><header className="checkout-header shell"><Brand /><Link href="/stays">← Back to stays</Link></header><section className="shell standalone-empty checkout-empty guest-state-card"><p className="eyebrow dark">Booking</p><h1>Online booking opens soon.</h1><p>You can explore every published stay now. Dates and secure checkout will open once the final booking tests are finished.</p><Link className="button" href="/stays">Find a stay</Link></section></main>;
  }

  return <main className="checkout-page"><header className="checkout-header shell"><Brand /><Link href={`/stays/${property.slug}`}>← Back to stay</Link></header><section className="shell standalone-empty checkout-empty guest-state-card"><p className="eyebrow dark">Booking</p><h1>{property.name}</h1><p>This stay is live on Find A Place, but online date selection and checkout are not open yet.</p><Link className="button" href={`/stays/${property.slug}`}>Back to this stay</Link></section></main>;
}
