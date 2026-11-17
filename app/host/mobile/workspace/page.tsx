import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getHostMobileOrganizations } from "@/lib/host/mobile-access";
import { mobileAppEnabled } from "@/lib/payments/host-mobile-billing";
import { HostWebApp } from "@/components/webapp/HostWebApp";
import "@/components/webapp/webapp.css";

export const metadata: Metadata = {
  title: "Host web app",
  manifest: "/apps/host/manifest.webmanifest",
};
export const dynamic = "force-dynamic";

export default async function HostWorkspace({
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
    ? organizations.find((o) => o.id === params.organizationId)
    : organizations.find((o) => o.entitled);
  if (!org?.entitled) redirect("/host/mobile?billing=access-required");

  return (
    <div className="fap-webapp">
      <div aria-label="Property management quick actions">
        <div
          className="shell"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: 10,
            paddingBottom: 10,
          }}
        >
          <Link
            className="button inline dark"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
            href={`/host/mobile/workspace/add-property?organizationId=${encodeURIComponent(org.id)}`}
          >
            + Add property
          </Link>
        </div>
      </div>
      <HostWebApp
        key={org.id}
        organization={{ id: org.id, name: org.name, mode: org.mode }}
        organizations={organizations.map((o) => ({
          id: o.id,
          name: o.name,
          mode: o.mode,
        }))}
      />
    </div>
  );
}
