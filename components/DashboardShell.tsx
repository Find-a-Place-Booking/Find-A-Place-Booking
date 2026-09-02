import Link from "next/link";
import { HostSidebar } from "./HostSidebar";

export function DashboardShell({ active, title, eyebrow, children }: { active: string; title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <HostSidebar active={active} />
      <main className="dash-main">
        <header className="dash-topbar">
          <div><small>{eyebrow || "Host dashboard"}</small><h1>{title}</h1></div>
          <div className="dash-actions"><Link className="button button-small button-quiet" href="/">View marketplace</Link><button className="notification" type="button" aria-label="Notifications">•<span>3</span></button><button className="avatar" type="button">FH</button></div>
        </header>
        {children}
      </main>
    </div>
  );
}
