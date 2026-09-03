import { redirect } from "next/navigation";

import { signInAdmin } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (userId) {
    const { data: isAdmin } = await supabase.rpc("is_active_admin");
    if (isAdmin === true) redirect("/admin");
  }

  return (
    <AuthShell
      eyebrow="Internal access"
      title="Find A Place admin."
      intro="This sign-in is reserved for authorized Find A Place staff, partners and technical administrators. Host accounts do not receive admin access automatically."
    >
      {params.error ? <div className="auth-message auth-error" role="alert">{params.error}</div> : null}
      {userId ? <div className="auth-message auth-warning">A non-admin account is currently signed in. Submitting this form will switch to the authorized admin account.</div> : null}
      <form className="auth-form" action={signInAdmin}>
        <label><span>Admin email</span><input name="email" type="email" autoComplete="email" required /></label>
        <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="button button-full" type="submit">Open admin workspace</button>
      </form>
      <p className="auth-help">There is no public admin registration. Internal accounts must exist in Supabase Auth and be explicitly granted an active admin record and role.</p>
    </AuthShell>
  );
}
