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
  { label: "Properties", href: "/admin/properties", key: "properties" },
  { label: "Calendars", href: "/admin/calendars", key: "calendars" },
  {
    label: "Reservations",
    href: "/admin/reservations",
    key: "reservations",
  },
  { label: "Reports", href: "/admin/reports", key: "reports" },
  {
    label: "Property taxes",
    href: "/admin/taxes",
    key: "taxes",
    roles: ["SUPER_ADMIN", "FINANCE_ADMIN"],
  },
  {
    label: "Site content",
    href: "/admin/content",
    key: "content",
    roles: ["SUPER_ADMIN", "OPERATIONS_ADMIN"],
  },
  {
    label: "Partner rates",
    href: "/admin/partners",
    key: "partners",
    roles: ["SUPER_ADMIN", "PARTNER_ADMIN"],
  },
  {
    label: "Activity log",
    href: "/admin/audit",
    key: "audit",
  },
];

export function AdminSidebar({
  active,
  roles,
}: {
  active: string;
  roles: AdminRole[];
}) {
  const visibleNav = nav.filter(
    (item) =>
      !item.roles ||
      item.roles.some((role) => roles.includes(role)),
  );

  return (
    <aside className="admin-side">
      <Brand compact />
      <p className="admin-label">Find A Place team</p>
      <nav>
        {visibleNav.map((item) => (
          <Link
            className={active === item.key ? "active" : ""}
            href={item.href}
            key={item.key}
          >
            {item.label}
            <span>›</span>
          </Link>
        ))}
      </nav>
      <Link href="/">← Booking marketplace</Link>
    </aside>
  );
}
