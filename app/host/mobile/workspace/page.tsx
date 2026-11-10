import type { Metadata } from "next";
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
    <HostWebApp
      key={org.id}
      organization={{ id: org.id, name: org.name, mode: org.mode }}
      organizations={organizations.map((o) => ({
        id: o.id,
        name: o.name,
        mode: o.mode,
      }))}
    />
  );
}
