import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { HostOptionalFeeBuilder } from "@/components/HostOptionalFeeBuilder";
import { getPricingWorkspaceBySlug } from "@/lib/host/pricing";

export default async function OptionalFeePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { property } = await getPricingWorkspaceBySlug(slug);

  return (
    <DashboardShell active="Rates & fees" title={property.form.name || "Optional guest extras"} eyebrow="Property pricing">
      <p><Link href={`/host/rates/${slug}`}>← Back to rates and fees</Link></p>
      <section className="panel">
        <p className="eyebrow dark">Additional fees and extras</p>
        <h2>Add an optional guest extra</h2>
        <p className="muted">Choose the type, enter its price and select how it is charged. Leave the amounts empty until you want to create a charge; only saved, active extras can be offered in checkout.</p>
        <HostOptionalFeeBuilder unitId={property.unitId} slug={slug} />
      </section>
    </DashboardShell>
  );
}
