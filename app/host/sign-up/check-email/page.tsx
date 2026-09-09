import Link from "next/link";

import { AuthShell } from "@/components/AuthShell";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      eyebrow="Confirm your account"
      title="Check your email."
      intro="Your account has been created, but the email address must be confirmed before the host portal can open."
      footer={<p>Already confirmed it? <Link href="/host/sign-in?next=%2Fhost%2Fonboarding">Sign in here</Link>.</p>}
    >
      <div className="auth-confirm-box">
        <span>✓</span>
        <div><strong>Confirmation sent</strong><p>{params.email ? `Open the message sent to ${params.email} and use the confirmation link.` : "Open the confirmation message and use the link inside it."}</p></div>
      </div>
      <p className="auth-help">If the message does not arrive within a few minutes, check spam/junk before trying again.</p>
    </AuthShell>
  );
}
