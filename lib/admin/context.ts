import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AdminRole =
  | "SUPER_ADMIN"
  | "FINANCE_ADMIN"
  | "OPERATIONS_ADMIN"
  | "PARTNER_ADMIN"
  | "SUPPORT";

export type AdminContext = {
  profileId: string;
  email: string;
  fullName: string | null;
  initials: string;
  roles: AdminRole[];
};

function initials(fullName: string | null, email: string) {
  const nameParts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (nameParts.length >= 2) return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
  if (nameParts.length === 1) return nameParts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function hasAnyAdminRole(context: AdminContext, roles: AdminRole[]) {
  return context.roles.some((role) => roles.includes(role));
}

export async function getAdminContext(): Promise<AdminContext> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  if (!profileId) redirect("/admin/sign-in");

  const [{ data: profile }, { data: roleRows }, { data: activeAdmin }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name").eq("id", profileId).maybeSingle(),
    supabase.from("admin_role_assignments").select("role").eq("admin_profile_id", profileId),
    supabase.from("admin_users").select("status").eq("profile_id", profileId).maybeSingle(),
  ]);

  if (!profile || activeAdmin?.status !== "ACTIVE" || !roleRows?.length) {
    redirect("/admin/sign-in?error=Admin%20access%20is%20not%20active.");
  }

  const email = profile.email ?? "admin";
  const roles = roleRows.map((row) => row.role as AdminRole);

  return {
    profileId,
    email,
    fullName: profile.full_name,
    initials: initials(profile.full_name, email),
    roles,
  };
}
