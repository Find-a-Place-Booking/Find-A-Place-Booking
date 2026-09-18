import { redirect } from "next/navigation";

import { updatePassword } from "@/app/auth/actions";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/server";

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; portal?: string }>;
}) {
  const params = await searchParams;
  const portal = params.portal === "admin" ? "admin" : "host";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    redirect(`/auth/password-reset?portal=${portal}&error=${encodeURIComponent("That recovery session is invalid or expired. Request a new link.")}`);
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password."
      intro="Use at least eight characters and keep this password unique to Find A Place Booking."
    >
      {params.error ? (
        <div className="auth-message auth-error" role="alert">
          {params.error}
        </div>
      ) : null}
      <form className="auth-form" action={updatePassword}>
        <input type="hidden" name="portal" value={portal} />
        <label>
          <span>New password</span>
          <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label>
          <span>Confirm new password</span>
          <input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <button className="button button-full" type="submit">
          Update password
        </button>
      </form>
    </AuthShell>
  );
}
