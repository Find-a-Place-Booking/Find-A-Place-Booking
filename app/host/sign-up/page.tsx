import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpHost } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";
import { AuthCaptcha } from "@/components/AuthCaptcha";
import { HostSignupPolicyReview } from "@/components/HostSignupPolicyReview";
import { safeInternalPath } from "@/lib/auth/paths";
import { getCurrentPolicyVersions } from "@/lib/policies/current";
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
  const policyVersions = await getCurrentPolicyVersions(supabase);

  return (
    <AuthShell
      eyebrow="List a stay"
      title="Create your host account."
      intro="Start with the person who manages the property. Business, listing, payment and partner-verification details come next in the guided host setup."
      footer={<p>Already have an account? <Link href={`/host/sign-in?next=${encodeURIComponent(next)}`}>Sign in</Link>.</p>}
    >
      {params.error ? <div className="auth-message auth-error" role="alert">{params.error}</div> : null}
      <form className="auth-form" action={signUpHost}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="host_terms_version" value={policyVersions.hostAgreement.version} />
        <input type="hidden" name="platform_terms_version" value={policyVersions.guestTerms.version} />
        <input type="hidden" name="cancellation_policy_version" value={policyVersions.cancellationPolicy.version} />
        <input type="hidden" name="privacy_notice_version" value={policyVersions.privacyNotice.version} />

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

        <section className="panel" aria-label="How Find A Place fees work" style={{ padding: 16, display: "grid", gap: 8 }}>
          <strong>How booking fees work</strong>
          <p className="muted" style={{ margin: 0 }}>
            For standard new direct bookings, the guest sees a 7% Find A Place service fee on the discounted lodging subtotal before payment. Verified partners may qualify for a separate rate, which is shown at checkout. The fee does not apply to cleaning charges, pet fees, separately listed extras or lodging taxes. You do not pay a second Find A Place platform commission on guest-paid-fee bookings.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Your connected Stripe account receives guest booking charges. Stripe processing charges and your property's lodging tax responsibilities remain yours. Older reservations keep their original fee and payment terms.
          </p>
        </section>

        <HostSignupPolicyReview />
        <AuthCaptcha action="host_signup" />

        <p className="auth-form-note">Creating an account does not automatically make you a verified Find A Place partner. Partner status is reviewed and approved separately during onboarding.</p>
        <button className="button button-full" type="submit">Create host account</button>
      </form>
    </AuthShell>
  );
}
