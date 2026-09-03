import Link from "next/link";

import type { AdminRole } from "@/lib/admin/context";
import { Brand } from "./Brand";

type NavItem = {
  label: string;
  href: string;
  key: string;
  roles?: AdminRole[];
};

const nav: NavItem[] = [
  { label: "Overview", href: "/admin", key: "overview" },
  { label: "Hosts", href: "/admin/hosts", key: "hosts" },
  { label: "Partner verification", href: "/admin/partners", key: "partners", roles: ["SUPER_ADMIN", "PARTNER_ADMIN"] },
  { label: "Audit log", href: "/admin/audit", key: "audit" },
];

export function AdminSidebar({ active, roles }: { active: string; roles: AdminRole[] }) {
  const visibleNav = nav.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));

  return (
    <aside className="admin-side">
      <Brand compact />
      <p className="admin-label">Find A Place team</p>
      <nav>
        {visibleNav.map((item) => (
          <Link className={active === item.key ? "active" : ""} href={item.href} key={item.key}>
            {item.label}<span>›</span>
          </Link>
        ))}
      </nav>
      <Link href="/">← Booking marketplace</Link>
    </aside>
  );
}
