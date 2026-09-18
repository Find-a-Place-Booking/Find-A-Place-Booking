import Link from "next/link";

import { requestPasswordReset } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    sent?: string;
    portal?: string;
  }>;
}) {
  const params = await searchParams;
  const portal = params.portal === "admin" ? "admin" : "host";
  const signInPath = portal === "admin" ? "/admin/sign-in" : "/host/sign-in";

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password."
      intro="Enter the email address on the account. If it matches an account, we'll send a secure recovery link."
      footer={<p><Link href={signInPath}>Return to sign in</Link>.</p>}
    >
      {params.error ? (
        <div className="auth-message auth-error" role="alert">
          {params.error}
        </div>
      ) : null}
      {params.sent ? (
        <div className="auth-confirm-box">
          <span>✓</span>
          <div>
            <strong>Check your email</strong>
            <p>If the address matches an account, a time-limited recovery link is on its way.</p>
          </div>
        </div>
      ) : (
        <form className="auth-form" action={requestPasswordReset}>
          <input type="hidden" name="portal" value={portal} />
          <label>
            <span>Email address</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button className="button button-full" type="submit">
            Send recovery link
          </button>
        </form>
      )}
    </AuthShell>
  );
}
