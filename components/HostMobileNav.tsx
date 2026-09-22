import Link from "next/link";

import { signOutHost } from "@/app/auth/actions";

const links = [
  ["Overview", "/host"],
  ["Properties", "/host/properties"],
  ["Calendar", "/host/calendar"],
  ["Reservations", "/host/reservations"],
  ["Rates & fees", "/host/rates"],
  ["Payments & taxes", "/host/payments"],
  ["Messages", "/host/messages"],
  ["Reports", "/host/reports"],
  ["Settings", "/host/settings"],
  ["Help & contact", "/contact#host"],
];

export function HostMobileNav({ active }: { active: string }) {
  return (
    <details className="internal-mobile-nav">
      <summary>
        <span>Host menu</span>
        <strong>{active}</strong>
        <b aria-hidden="true">⌄</b>
      </summary>

      <nav>
        {links.map(([label, href]) => (
          <Link
            className={active === label ? "active" : ""}
            href={href}
            key={label}
          >
            {label}
            <span>›</span>
          </Link>
        ))}

        <Link href="/">
          Booking marketplace
          <span>↗</span>
        </Link>

        <form action={signOutHost}>
          <button className="internal-mobile-signout" type="submit">
            Sign out
            <span>›</span>
          </button>
        </form>
      </nav>
    </details>
  );
}
