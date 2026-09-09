import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Brand } from "./Brand";

const links = [
  ["Overview", "/host"], ["Properties", "/host/properties"], ["Calendar", "/host/calendar"], ["Reservations", "/host/reservations"], ["Rates & fees", "/host/rates"], ["Payments & taxes", "/host/payments"], ["Messages", "/host/messages"], ["Reports", "/host/reports"], ["Settings", "/host/settings"]
];

async function livePropertyLabel() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;
  if (!profileId) return "No properties live yet";

  const { data: memberships } = await supabase.from("organization_members").select("organization_id").eq("profile_id", profileId).eq("status", "ACTIVE");
  const organizationIds = (memberships ?? []).map((row) => row.organization_id as string);
  if (!organizationIds.length) return "No properties live yet";

  const { count } = await supabase.from("properties").select("id", { count: "exact", head: true }).in("organization_id", organizationIds).eq("status", "PUBLISHED");
  const published = count ?? 0;
  return published ? `${published} ${published === 1 ? "property" : "properties"} live` : "No properties live yet";
}

export async function HostSidebar({ active }: { active: string }) {
  const liveLabel = await livePropertyLabel();
  return (
    <aside className="dash-sidebar">
      <Brand compact />
      <div className="workspace"><span>Workspace</span><strong>Host account</strong><small>{liveLabel}</small></div>
      <nav>{links.map(([label, href]) => <Link className={active === label ? "active" : ""} key={label} href={href}>{label}<span>›</span></Link>)}</nav>
      <div className="side-note"><strong>Need a hand?</strong><p>Booking support, listing questions and account help can all be handled from the host portal.</p><button type="button">Contact support →</button></div>
    </aside>
  );
}
