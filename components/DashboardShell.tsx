import Link from "next/link";

import { signOutHost } from "@/app/auth/actions";
import { HostMobileNav } from "./HostMobileNav";
import { HostSidebar } from "./HostSidebar";

export function DashboardShell({ active, title, eyebrow, children }: { active: string; title: string; eyebrow?: string; children: React.ReactNode }) {
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
            <span className="avatar" aria-label="Host account">H</span>
            <form action={signOutHost}><button className="portal-signout" type="submit">Sign out</button></form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
