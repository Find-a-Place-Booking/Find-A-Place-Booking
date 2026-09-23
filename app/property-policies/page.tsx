import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { legalStyles } from "@/components/LegalDocument";
import { copyBlock, loadManagedCopy } from "@/lib/public/managed-copy";

const defaults = {
  "property_policies.intro": { eyebrow: "Guest information", title: "Property policies", body: "Each Find A Place stay is independently operated and can have its own house rules, cancellation/refund terms and operating policies. The rules that apply to a reservation are presented with that property and reviewed again during checkout before payment." },
  "property_policies.includes": { title: "What property policies can include", body: "Depending on the stay, policies may cover occupancy, pets, minimum booking age, quiet hours, smoking, parking, check-in and checkout, cancellation/refund terms, property-specific instructions and an uploaded policy document from the host." },
  "property_policies.before": { title: "Before booking", body: "Open the property listing and review its rules before starting checkout. During checkout, Find A Place requires the booking guest to open the host's property policies and the platform terms before accepting them and continuing to payment." },
  "property_policies.cancellation": { title: "Cancellations and refunds", body: "Cancellation and refund requests go to the host and are decided under the property terms accepted for the reservation, subject to applicable law. Sending a request does not cancel the reservation or guarantee a refund. If the host approves a refund, it is funded from the host's connected payment charge.\n\nFind A Place's host-paid platform commission is earned when a paid booking connects the guest and host. That commission is not refunded or reversed because the reservation is later cancelled, refunded, shortened or changed." },
  "property_policies.after": { title: "After booking", body: "Open My Trip to review booking details, contact the host and send any cancellation or change request directly to the host. The reservation stays active until the host acts on the request and the platform records the resulting change." },
};

export default async function PropertyPoliciesPage() {
  const content = await loadManagedCopy(defaults); const get = (key: keyof typeof defaults) => copyBlock(content, key); const intro = get("property_policies.intro");
  return <><Header /><main className={legalStyles.wrap}><article className={`shell ${legalStyles.article}`}><p className="eyebrow dark">{intro.eyebrow}</p><h1>{intro.title}</h1><p>{intro.body}</p>{(["property_policies.includes", "property_policies.before", "property_policies.cancellation", "property_policies.after"] as const).map((key) => { const block = get(key); return <section key={key}><h2>{block.title}</h2>{String(block.body || "").split(/\n\s*\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</section>; })}<div className={legalStyles.links}><Link href="/stays">Find a stay</Link><Link href="/trip">Manage a trip</Link><Link href="/terms">Booking Terms</Link><Link href="/cancellation-policy">Cancellation &amp; Refund Requests</Link></div></article></main><Footer /></>;
}
