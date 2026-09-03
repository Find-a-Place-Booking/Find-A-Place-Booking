import Link from "next/link";

const links = [
  ["Overview", "#top"],
  ["Property approvals", "#approvals"],
  ["Partner verification", "#partners"],
  ["Hosts", "#hosts"],
  ["Listings", "#listings"],
  ["Reservations", "#reservations"],
  ["Payments & ledger", "#finance"],
  ["Support", "#attention"],
  ["Activity log", "#activity"]
];

export function AdminMobileNav() {
  return (
    <details className="internal-mobile-nav admin-mobile-nav">
      <summary><span>Admin menu</span><strong>Overview</strong><b>⌄</b></summary>
      <nav>{links.map(([label, href], index) => <a className={index === 0 ? "active" : ""} href={href} key={label}>{label}<span>›</span></a>)}<Link href="/">Booking marketplace<span>↗</span></Link></nav>
    </details>
  );
}
