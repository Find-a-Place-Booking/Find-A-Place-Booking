import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpHost } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";
import { safeInternalPath } from "@/lib/auth/paths";
import { HOST_AGREEMENT_VERSION } from "@/lib/policies/versions";
import { createClient } from "@/lib/supabase/server";

export default async function HostSignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next, "/host/onboarding");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) redirect(next);

  return (
    <AuthShell
      eyebrow="List a stay"
      title="Create your host account."
      intro="Start with the person who manages the property. The actual business, property and partner-verification details come next in the guided host setup."
      footer={<p>Already have an account? <Link href={`/host/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>.</p>}
    >
      {params.error ? <div className="auth-message auth-error" role="alert">{params.error}</div> : null}
      <form className="auth-form" action={signUpHost}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="host_terms_version" value={HOST_AGREEMENT_VERSION} />
        <div className="auth-field-grid">
          <label><span>Your name</span><input name="full_name" autoComplete="name" required /></label>
          <label><span>Phone <small>optional</small></span><input name="phone" type="tel" autoComplete="tel" /></label>
        </div>
        <label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
        <div className="auth-field-grid">
          <label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label><span>Confirm password</span><input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required /></label>
        </div>

        <label className="checkline">
          <input name="host_terms_accepted" type="checkbox" required />
          <span>
            I have read and agree to the <Link href="/host-agreement" target="_blank">Host Agreement</Link>,{" "}
            <Link href="/terms" target="_blank">Terms of Service</Link>,{" "}
            <Link href="/cancellation-policy" target="_blank">cancellation and payout rules</Link>, and{" "}
            <Link href="/privacy" target="_blank">Privacy Notice</Link>.
          </span>
        </label>

        <p className="auth-form-note">Creating an account does not grant the 5% partner commission. Existing Find A Place partners are verified separately during onboarding.</p>
        <button className="button button-full" type="submit">Create host account</button>
      </form>
    </AuthShell>
  );
}
