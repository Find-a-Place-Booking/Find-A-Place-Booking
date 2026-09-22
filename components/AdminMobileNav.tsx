import Link from "next/link";

import { signOutAdmin } from "@/app/auth/actions";
import type { AdminRole } from "@/lib/admin/context";

type MobileLink = [
  label: string,
  href: string,
  key: string,
  roles?: AdminRole[],
];

const links: MobileLink[] = [
  ["Overview", "/admin", "overview"],
  ["Hosts", "/admin/hosts", "hosts"],
  ["Properties", "/admin/properties", "properties"],
  ["Calendars", "/admin/calendars", "calendars"],
  ["Reservations", "/admin/reservations", "reservations"],
  ["Reports", "/admin/reports", "reports"],
  [
    "Taxes",
    "/admin/taxes",
    "taxes",
    ["SUPER_ADMIN", "FINANCE_ADMIN"],
  ],
  [
    "Site content",
    "/admin/content",
    "content",
    ["SUPER_ADMIN", "OPERATIONS_ADMIN"],
  ],
  [
    "Partner rates",
    "/admin/partners",
    "partners",
    ["SUPER_ADMIN", "PARTNER_ADMIN"],
  ],
  ["Audit log", "/admin/audit", "audit"],
];

export function AdminMobileNav({
  active,
  roles,
}: {
  active: string;
  roles: AdminRole[];
}) {
  const visibleLinks = links.filter(
    ([, , , requiredRoles]) =>
      !requiredRoles ||
      requiredRoles.some((role) => roles.includes(role)),
  );

  const activeLabel =
    visibleLinks.find(([, , key]) => key === active)?.[0] ??
    "Admin";

  return (
    <details className="internal-mobile-nav admin-mobile-nav">
      <summary>
        <span>Admin menu</span>
        <strong>{activeLabel}</strong>
        <b aria-hidden="true">⌄</b>
      </summary>

      <nav>
        {visibleLinks.map(([label, href, key]) => (
          <Link
            className={active === key ? "active" : ""}
            href={href}
            key={key}
          >
            {label}
            <span>›</span>
          </Link>
        ))}

        <Link href="/">
          Booking marketplace
          <span>↗</span>
        </Link>

        <form action={signOutAdmin}>
          <button className="internal-mobile-signout" type="submit">
            Sign out
            <span>›</span>
          </button>
        </form>
      </nav>
    </details>
  );
}
