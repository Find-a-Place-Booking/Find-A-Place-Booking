import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpHost } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";
import { AuthCaptcha } from "@/components/AuthCaptcha";
import { HostSignupPolicyReview } from "@/components/HostSignupPolicyReview";
import { safeInternalPath } from "@/lib/auth/paths";
import {
  CANCELLATION_POLICY_VERSION,
  GUEST_TERMS_VERSION,
  HOST_AGREEMENT_VERSION,
  PRIVACY_NOTICE_VERSION,
} from "@/lib/policies/versions";
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
      intro="Start with the person who manages the property. Business, property, payment and partner-verification details come next in the guided host setup."
      footer={<p>Already have an account? <Link href={`/host/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>.</p>}
    >
      {params.error ? <div className="auth-message auth-error" role="alert">{params.error}</div> : null}
      <form className="auth-form" action={signUpHost}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="host_terms_version" value={HOST_AGREEMENT_VERSION} />
        <input type="hidden" name="platform_terms_version" value={GUEST_TERMS_VERSION} />
        <input type="hidden" name="cancellation_policy_version" value={CANCELLATION_POLICY_VERSION} />
        <input type="hidden" name="privacy_notice_version" value={PRIVACY_NOTICE_VERSION} />

        {/* Human visitors never see or interact with this bot-trap field. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="signup-contact-website">Website</label>
          <input id="signup-contact-website" name="contact_website" type="text" autoComplete="off" tabIndex={-1} defaultValue="" />
        </div>

        <div className="auth-field-grid">
          <label><span>Your name</span><input name="full_name" autoComplete="name" maxLength={120} required /></label>
          <label><span>Contact phone</span><input name="phone" type="tel" autoComplete="tel" minLength={10} maxLength={40} required /></label>
        </div>
        <label><span>Email address</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <div className="auth-field-grid">
          <label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label><span>Confirm password</span><input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required /></label>
        </div>

        <HostSignupPolicyReview />
        <AuthCaptcha action="host_signup" />

        <p className="auth-form-note">Creating an account does not grant the 5% partner commission. Existing Find A Place partners are verified separately during onboarding.</p>
        <button className="button button-full" type="submit">Create host account</button>
      </form>
    </AuthShell>
  );
}
