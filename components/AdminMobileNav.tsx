import Link from "next/link";

import type { AdminRole } from "@/lib/admin/context";

type MobileLink = [label: string, href: string, key: string, roles?: AdminRole[]];

const links: MobileLink[] = [
  ["Overview", "/admin", "overview"],
  ["Hosts", "/admin/hosts", "hosts"],
  ["Partner verification", "/admin/partners", "partners", ["SUPER_ADMIN", "PARTNER_ADMIN"]],
  ["Audit log", "/admin/audit", "audit"],
];

export function AdminMobileNav({ active, roles }: { active: string; roles: AdminRole[] }) {
  const visibleLinks = links.filter(([, , , requiredRoles]) => !requiredRoles || requiredRoles.some((role) => roles.includes(role)));
  const activeLabel = visibleLinks.find(([, , key]) => key === active)?.[0] ?? "Admin";

  return (
    <details className="internal-mobile-nav admin-mobile-nav">
      <summary><span>Admin menu</span><strong>{activeLabel}</strong><b>⌄</b></summary>
      <nav>
        {visibleLinks.map(([label, href, key]) => (
          <Link className={active === key ? "active" : ""} href={href} key={key}>
            {label}<span>›</span>
          </Link>
        ))}
        <Link href="/">Booking marketplace<span>↗</span></Link>
      </nav>
    </details>
  );
}
