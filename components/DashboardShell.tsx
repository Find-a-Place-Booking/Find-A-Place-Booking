import Link from "next/link";

import { signOutHost } from "@/app/auth/actions";
import { getHostAccountProfile, initialsForHost } from "@/lib/host/profile";
import { HostMobileNav } from "./HostMobileNav";
import { HostSidebar } from "./HostSidebar";

export async function DashboardShell({ active, title, eyebrow, children }: { active: string; title: string; eyebrow?: string; children: React.ReactNode }) {
  const profile = await getHostAccountProfile();
  const initials = initialsForHost(profile);

  return (
    <div className="dashboard-layout">
      <HostSidebar active={active} />
      <main className="dash-main">
        <HostMobileNav active={active} />
        <header className="dash-topbar">
          <div><small>{eyebrow || "Host dashboard"}</small><h1>{title}</h1></div>
          <div className="dash-actions">
            <Link className="button button-small button-quiet dash-marketplace-link" href="/">View marketplace</Link>
            <button className="notification" type="button" aria-label="Notifications">•</button>
            <Link className={`avatar ${profile.avatarUrl ? "has-image" : ""}`} href="/host/settings" aria-label="Host account settings">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}
            </Link>
            <form action={signOutHost}><button className="portal-signout" type="submit">Sign out</button></form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
