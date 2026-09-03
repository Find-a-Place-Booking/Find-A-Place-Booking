import Link from "next/link";

import { signOutAdmin } from "@/app/auth/actions";
import type { AdminContext } from "@/lib/admin/context";
import { AdminMobileNav } from "./AdminMobileNav";
import { AdminSidebar } from "./AdminSidebar";

export function AdminShell({
  active,
  eyebrow,
  title,
  context,
  children,
}: {
  active: string;
  eyebrow: string;
  title: string;
  context: AdminContext;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-layout">
      <AdminSidebar active={active} roles={context.roles} />
      <main className="admin-main">
        <AdminMobileNav active={active} roles={context.roles} />
        <header>
          <div><small>{eyebrow}</small><h1>{title}</h1></div>
          <div className="admin-head-actions">
            <Link className="button button-small button-quiet admin-marketplace-link" href="/">Marketplace</Link>
            <span className="avatar" title={context.email} aria-label={`Signed in as ${context.email}`}>{context.initials}</span>
            <form action={signOutAdmin}><button className="portal-signout" type="submit">Sign out</button></form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
