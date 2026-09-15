import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function ConfirmedPage() {
  return <main className="confirm-page"><header className="checkout-header shell"><Brand /><span>Your reservation</span></header><section className="confirm-card guest-state-card"><p className="eyebrow dark">No trip loaded</p><h1>There isn’t a confirmed booking here yet.</h1><p>Once online booking opens, your confirmation and trip details will show up here after checkout.</p><Link className="button" href="/stays">Find a stay</Link><Link className="confirm-secondary" href="/">Back to Find A Place</Link></section></main>;
}
