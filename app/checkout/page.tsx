import Link from "next/link";
import { Brand } from "@/components/Brand";
import { properties } from "@/data/catalog";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ stay?: string }> }) {
  const params = await searchParams;
  const property = properties.find((item) => item.slug === params.stay);

  if (!property) {
    return <main className="checkout-page"><header className="checkout-header shell"><Brand /><Link href="/stays">← Back to search</Link></header><section className="shell standalone-empty checkout-empty"><p className="eyebrow dark">Checkout</p><h1>No stay is ready for checkout.</h1><p>Choose a published stay from search. Checkout is not enabled yet.</p><Link className="button" href="/stays">Search stays</Link></section></main>;
  }

  return <main className="checkout-page"><header className="checkout-header shell"><Brand /><Link href={`/stays/${property.slug}`}>← Back to stay</Link></header><section className="shell standalone-empty checkout-empty"><p className="eyebrow dark">Checkout foundation</p><h1>{property.name}</h1><p>Guest details, final availability revalidation, booking holds, host policies, taxes and secure payment fields will be connected after availability, reservation, tax and payment systems are enabled.</p><Link className="button" href={`/stays/${property.slug}`}>Back to property</Link></section></main>;
}
