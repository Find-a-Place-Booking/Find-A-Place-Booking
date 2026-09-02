import Link from "next/link";
import { Brand } from "./Brand";

const links = [
  ["Overview", "/host"], ["Properties", "/host/properties"], ["Calendar", "/host/calendar"], ["Reservations", "/host/reservations"], ["Rates & fees", "/host/rates"], ["Payments & taxes", "/host/payments"], ["Messages", "/host/messages"], ["Reports", "/host/reports"], ["Settings", "/host/settings"]
];

export function HostSidebar({ active }: { active: string }) {
  return (
    <aside className="dash-sidebar">
      <Brand compact />
      <div className="workspace"><span>Workspace</span><strong>Fancy Hill Cabins</strong><small>8 active listings</small></div>
      <nav>{links.map(([label, href]) => <Link className={active === label ? "active" : ""} key={label} href={href}>{label}<span>›</span></Link>)}</nav>
      <div className="side-note"><strong>Need a hand?</strong><p>Booking support, listing questions and account help can all be handled from the host portal.</p><button type="button">Contact support →</button></div>
    </aside>
  );
}
