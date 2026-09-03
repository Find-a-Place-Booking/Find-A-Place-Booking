import Link from "next/link";

const links = [
  ["Overview", "/host"], ["Properties", "/host/properties"], ["Calendar", "/host/calendar"], ["Reservations", "/host/reservations"], ["Rates & fees", "/host/rates"], ["Payments & taxes", "/host/payments"], ["Messages", "/host/messages"], ["Reports", "/host/reports"], ["Settings", "/host/settings"]
];

export function HostMobileNav({ active }: { active: string }) {
  return (
    <details className="internal-mobile-nav">
      <summary><span>Host menu</span><strong>{active}</strong><b>⌄</b></summary>
      <nav>{links.map(([label, href]) => <Link className={active === label ? "active" : ""} href={href} key={label}>{label}<span>›</span></Link>)}</nav>
    </details>
  );
}
