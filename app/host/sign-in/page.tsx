import Link from "next/link";

import { signInHost } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";
import { safeInternalPath } from "@/lib/auth/paths";

export default async function HostSignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next, "/host");

  return (
    <AuthShell
      eyebrow="Host portal"
      title="Welcome back."
      intro="Sign in to manage your properties, reservations, calendars, rates and payouts."
      footer={
        <p>
          New to Find A Place Booking?{" "}
          <Link
            href={`/host/sign-up?next=${encodeURIComponent(
              "/host/onboarding",
            )}`}
          >
            Create a host account
          </Link>
          .
        </p>
      }
    >
      {params.error ? (
        <div
          className="auth-message auth-error"
          role="alert"
        >
          {params.error}
        </div>
      ) : null}

      {params.saved ? (
        <div className="admin-message success">
          {params.saved}
        </div>
      ) : null}

      <form className="auth-form" action={signInHost}>
        <input type="hidden" name="next" value={next} />

        <label>
          <span>Email address</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>

        <label>
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <button
          className="button button-full"
          type="submit"
        >
          Sign in to host portal
        </button>
      </form>

      <p className="auth-help">
        <Link href="/auth/password-reset?portal=host">
          Forgot your password?
        </Link>
      </p>
    </AuthShell>
  );
}
