import Link from "next/link";
import { redirect } from "next/navigation";

import { signInHost } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";
import { safeInternalPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

export default async function HostSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next, "/host");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) redirect(next);

  return (
    <AuthShell
      eyebrow="Host portal"
      title="Welcome back."
      intro="Sign in to manage your properties, reservations, calendars, rates and payouts."
      footer={<p>New to Find A Place Booking? <Link href={`/host/sign-up?next=${encodeURIComponent("/host/onboarding")}`}>Create a host account</Link>.</p>}
    >
      {params.error ? <div className="auth-message auth-error" role="alert">{params.error}</div> : null}
      <form className="auth-form" action={signInHost}>
        <input type="hidden" name="next" value={next} />
        <label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
        <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="button button-full" type="submit">Sign in to host portal</button>
      </form>
      <p className="auth-help">Password recovery will be added in the next auth-hardening pass. For this milestone, account creation, confirmation, sign-in, session refresh and sign-out are the acceptance targets.</p>
    </AuthShell>
  );
}
