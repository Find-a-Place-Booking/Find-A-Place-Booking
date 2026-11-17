import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HostAddProperty } from "@/components/webapp/HostAddProperty";
import { getHostMobileOrganizations } from "@/lib/host/mobile-access";
import { mobileAppEnabled } from "@/lib/payments/host-mobile-billing";
import "@/components/webapp/webapp.css";

export const metadata: Metadata = {
  title: "Add a property | Find A Place Host",
  manifest: "/apps/host/manifest.webmanifest",
};
export const dynamic = "force-dynamic";

export default async function AddMobilePropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const [params, organizations] = await Promise.all([
    searchParams,
    getHostMobileOrganizations(),
  ]);
  if (!mobileAppEnabled()) redirect("/host/mobile");

  const org = params.organizationId
    ? organizations.find((item) => item.id === params.organizationId)
    : organizations.find((item) => item.entitled);

  if (!org?.entitled) redirect("/host/mobile?access=required");

  return (
    <div className="fap-webapp">
      <header className="top">
        <div className="shell">
          <span className="eyebrow">Find A Place Host</span>
          <h1>Add a property</h1>
          <p>{org.name}</p>
        </div>
      </header>
      <main className="shell section stack">
        <div>
          <Link
            href={`/host/mobile/workspace?organizationId=${encodeURIComponent(org.id)}`}
          >
            ← Back to host app
          </Link>
        </div>
        <HostAddProperty organizationId={org.id} organizationName={org.name} />
      </main>
    </div>
  );
}
