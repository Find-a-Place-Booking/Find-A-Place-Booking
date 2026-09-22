"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/auth/paths";
import { HOST_AGREEMENT_VERSION } from "@/lib/policies/versions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function authError(
  path: string,
  message: string,
  next?: string,
): never {
  const params = new URLSearchParams({ error: message });
  if (next) params.set("next", next);
  redirect(`${path}?${params.toString()}`);
}

function recoveryError(
  path:
    | "/auth/password-reset"
    | "/auth/update-password",
  message: string,
  portal: "admin" | "host",
): never {
  const params = new URLSearchParams({
    error: message,
    portal,
  });
  redirect(`${path}?${params.toString()}`);
}

function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

function isSupabaseAuthCookie(name: string) {
  return (
    name.startsWith("sb-") &&
    (name.includes("-auth-token") ||
      name.includes("-code-verifier"))
  );
}

/*
 * Sign-in must never depend on whatever Supabase session cookie happens
 * to already be in the browser. Remove stale/current auth cookies first,
 * then let signInWithPassword establish a completely fresh session.
 */
async function clearLocalSupabaseSession() {
  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;

    try {
      cookieStore.delete(cookie.name);
    } catch {
      cookieStore.set(cookie.name, "", {
        path: "/",
        expires: new Date(0),
        maxAge: 0,
      });
    }
  }
}

export async function signInHost(
  formData: FormData,
) {
  const email = value(
    formData,
    "email",
  ).toLowerCase();
  const password = value(formData, "password");
  const next = safeInternalPath(
    formData.get("next"),
    "/host",
  );

  if (!email || !password) {
    authError(
      "/host/sign-in",
      "Enter your email and password.",
      next,
    );
  }

  await clearLocalSupabaseSession();

  const supabase = await createClient();
  const { error } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (error) {
    await clearLocalSupabaseSession();

    authError(
      "/host/sign-in",
      "We couldn't sign you in with that email and password.",
      next,
    );
  }

  redirect(next);
}

export async function signUpHost(
  formData: FormData,
) {
  const fullName = value(formData, "full_name");
  const phone = value(formData, "phone");
  const email = value(
    formData,
    "email",
  ).toLowerCase();
  const password = value(formData, "password");
  const confirmPassword = value(
    formData,
    "confirm_password",
  );
  const next = safeInternalPath(
    formData.get("next"),
    "/host/onboarding",
  );

  const acceptedTerms =
    formData.get("host_terms_accepted") === "on";
  const acceptedVersion = value(
    formData,
    "host_terms_version",
  );

  if (!fullName || !email || !password) {
    authError(
      "/host/sign-up",
      "Name, email and password are required.",
      next,
    );
  }

  if (
    !acceptedTerms ||
    acceptedVersion !== HOST_AGREEMENT_VERSION
  ) {
    authError(
      "/host/sign-up",
      "Review and accept the current Find A Place Host Agreement and platform terms before creating a host account.",
      next,
    );
  }

  if (password.length < 8) {
    authError(
      "/host/sign-up",
      "Use a password with at least 8 characters.",
      next,
    );
  }

  if (password !== confirmPassword) {
    authError(
      "/host/sign-up",
      "The passwords don't match.",
      next,
    );
  }

  await clearLocalSupabaseSession();

  const acceptedAt = new Date().toISOString();
  const requestHeaders = await headers();
  const userAgent =
    requestHeaders
      .get("user-agent")
      ?.slice(0, 500) || null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: siteUrl(),
      data: {
        full_name: fullName,
        phone: phone || null,
        signup_source: "host",
        host_agreement_version:
          HOST_AGREEMENT_VERSION,
        host_agreement_accepted_at: acceptedAt,
      },
    },
  });

  if (error || !data.user) {
    authError(
      "/host/sign-up",
      "We couldn't create the account. Check the information and try again.",
      next,
    );
  }

  const admin = createAdminClient();
  const { error: acceptanceError } = await admin
    .from("host_terms_acceptances")
    .insert({
      user_id: data.user.id,
      agreement_version:
        HOST_AGREEMENT_VERSION,
      accepted_at: acceptedAt,
      user_agent: userAgent,
    });

  if (acceptanceError) {
    console.error(
      "[signUpHost] unable to record host terms acceptance",
      acceptanceError,
    );

    await admin.auth.admin
      .deleteUser(data.user.id)
      .catch(() => undefined);

    authError(
      "/host/sign-up",
      "We couldn't save the host agreement acceptance. No host account was kept. Try again.",
      next,
    );
  }

  if (data.session) {
    redirect(next);
  }

  const params = new URLSearchParams({ next });
  if (email) params.set("email", email);

  redirect(
    `/host/sign-up/check-email?${params.toString()}`,
  );
}

export async function signInAdmin(
  formData: FormData,
) {
  const email = value(
    formData,
    "email",
  ).toLowerCase();
  const password = value(formData, "password");

  if (!email || !password) {
    authError(
      "/admin/sign-in",
      "Enter your admin email and password.",
    );
  }

  await clearLocalSupabaseSession();

  const supabase = await createClient();
  const { data, error } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (error || !data.user) {
    await clearLocalSupabaseSession();

    authError(
      "/admin/sign-in",
      "We couldn't sign you in with those credentials.",
    );
  }

  const {
    data: isAdmin,
    error: adminError,
  } = await supabase.rpc("is_active_admin");

  if (adminError || isAdmin !== true) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Local cleanup below is sufficient.
    }

    await clearLocalSupabaseSession();

    authError(
      "/admin/sign-in",
      "This account does not have active Find A Place admin access.",
    );
  }

  redirect("/admin");
}

export async function requestPasswordReset(
  formData: FormData,
) {
  const email = value(
    formData,
    "email",
  ).toLowerCase();

  const portal =
    value(formData, "portal") === "admin"
      ? "admin"
      : "host";

  if (!email) {
    recoveryError(
      "/auth/password-reset",
      "Enter the email address for your account.",
      portal,
    );
  }

  const supabase = await createClient();

  const redirectTo =
    `${siteUrl()}/auth/confirm?next=${encodeURIComponent(
      `/auth/update-password?portal=${portal}`,
    )}`;

  const { error } =
    await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );

  if (error) {
    console.error(
      "[requestPasswordReset] Supabase request failed",
      error,
    );
  }

  const params = new URLSearchParams({
    sent: "1",
    portal,
  });

  redirect(
    `/auth/password-reset?${params.toString()}`,
  );
}

export async function updatePassword(
  formData: FormData,
) {
  const password = value(formData, "password");
  const confirmPassword = value(
    formData,
    "confirm_password",
  );

  const portal =
    value(formData, "portal") === "admin"
      ? "admin"
      : "host";

  if (password.length < 8) {
    recoveryError(
      "/auth/update-password",
      "Use a password with at least 8 characters.",
      portal,
    );
  }

  if (password !== confirmPassword) {
    recoveryError(
      "/auth/update-password",
      "The passwords don't match.",
      portal,
    );
  }

  const supabase = await createClient();
  const { data } =
    await supabase.auth.getClaims();

  if (!data?.claims?.sub) {
    recoveryError(
      "/auth/password-reset",
      "That recovery session is invalid or expired. Request a new link.",
      portal,
    );
  }

  const { error } =
    await supabase.auth.updateUser({
      password,
    });

  if (error) {
    recoveryError(
      "/auth/update-password",
      "We couldn't update the password. Request a new recovery link and try again.",
      portal,
    );
  }

  try {
    await supabase.auth.signOut();
  } finally {
    await clearLocalSupabaseSession();
  }

  const destination =
    portal === "admin"
      ? "/admin/sign-in"
      : "/host/sign-in";

  redirect(
    `${destination}?saved=${encodeURIComponent(
      "Password updated. Sign in with your new password.",
    )}`,
  );
}

async function signOut(destination: string) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // A revoked refresh token must not prevent local logout.
  } finally {
    await clearLocalSupabaseSession();
  }

  redirect(destination);
}

export async function signOutHost() {
  await signOut("/host/sign-in");
}

export async function signOutAdmin() {
  await signOut("/admin/sign-in");
}
