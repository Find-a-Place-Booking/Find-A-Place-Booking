"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/auth/paths";
import { getCurrentPolicyVersions } from "@/lib/policies/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function requireAuthCaptcha(formData: FormData, path: string, next?: string): string {
  const token = value(formData, "captcha_token");
  if (!token || token.length > 4096) authError(path, "Complete the security check before continuing.", next);
  return token;
}

function authError(path: string, message: string, next?: string): never {
  const params = new URLSearchParams({ error: message });
  if (next) params.set("next", next);
  redirect(`${path}?${params.toString()}`);
}

function recoveryError(path: "/auth/password-reset" | "/auth/update-password", message: string, portal: "admin" | "host"): never {
  const params = new URLSearchParams({ error: message, portal });
  redirect(`${path}?${params.toString()}`);
}

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function isSupabaseAuthCookie(name: string) {
  return name.startsWith("sb-") && (name.includes("-auth-token") || name.includes("-code-verifier"));
}

async function clearLocalSupabaseSession() {
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;
    try { store.delete(cookie.name); }
    catch { store.set(cookie.name, "", { path: "/", expires: new Date(0), maxAge: 0 }); }
  }
}

export async function signInHost(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const next = safeInternalPath(formData.get("next"), "/host");
  if (!email || !password) authError("/host/sign-in", "Enter your email and password.", next);
  const captchaToken = requireAuthCaptcha(formData, "/host/sign-in", next);
  await clearLocalSupabaseSession();
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) {
    await clearLocalSupabaseSession();
    authError("/host/sign-in", "We couldn't sign you in with that email and password.", next);
  }
  redirect(next);
}

export async function signUpHost(formData: FormData) {
  const fullName = value(formData, "full_name");
  const phone = value(formData, "phone");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirm_password");
  const next = safeInternalPath(formData.get("next"), "/host/onboarding");
  const acceptedTerms = formData.get("host_terms_accepted") === "on";
  const acceptedHostVersion = value(formData, "host_terms_version");
  const acceptedPlatformVersion = value(formData, "platform_terms_version");
  const acceptedCancellationVersion = value(formData, "cancellation_policy_version");
  const acceptedPrivacyVersion = value(formData, "privacy_notice_version");
  const allPoliciesOpened = ["host_agreement_opened", "platform_terms_opened", "cancellation_policy_opened", "privacy_notice_opened"]
    .every(key => value(formData, key) === "yes");

  if (!fullName || !email || !password) authError("/host/sign-up", "Name, email and password are required.", next);
  if (value(formData, "contact_website")) {
    console.warn("[host signup] hidden-field submission rejected");
    authError("/host/sign-up", "We couldn't verify this signup. Refresh the page and try again.", next);
  }
  if (fullName.length < 2 || fullName.length > 120 || email.length > 254)
    authError("/host/sign-up", "Enter your name and a valid email address.", next);
  const digits = phone.replace(/\D/g, "");
  if (phone.length > 40 || digits.length < 10 || digits.length > 15 || !/^[+\d().\s-]+$/.test(phone))
    authError("/host/sign-up", "Enter a valid contact phone number (10–15 digits).", next);

  // Match the ACTUAL published policy versions, not a months-old static file.
  const policyClient = await createClient();
  const { data: policyRows, error: publishedPolicyError } = await policyClient
    .from("platform_policy_versions")
    .select("policy_key,version_label")
    .in("policy_key", ["guest_terms", "host_agreement", "cancellation_policy", "privacy_notice"]);
  if (publishedPolicyError || (policyRows?.length ?? 0) !== 4) {
    authError("/host/sign-up", "The current agreements could not be verified. Please try again when the service is available.", next);
  }
  const currentVersions = await getCurrentPolicyVersions(policyClient);
  const versionMatch = acceptedHostVersion === currentVersions.hostAgreement.version &&
    acceptedPlatformVersion === currentVersions.guestTerms.version &&
    acceptedCancellationVersion === currentVersions.cancellationPolicy.version &&
    acceptedPrivacyVersion === currentVersions.privacyNotice.version;
  if (!acceptedTerms || !allPoliciesOpened || !versionMatch)
    authError("/host/sign-up", "The policies may have changed. Refresh, review each current Find A Place policy, and agree before creating your account.", next);
  if (password.length < 8) authError("/host/sign-up", "Use a password with at least 8 characters.", next);
  if (password !== confirmPassword) authError("/host/sign-up", "The passwords don't match.", next);

  const captchaToken = requireAuthCaptcha(formData, "/host/sign-up", next);
  await clearLocalSupabaseSession();
  const acceptedAt = new Date().toISOString();
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) || null;
  const client = await createClient();
  const { data, error } = await client.auth.signUp({
    email, password,
    options: {
      captchaToken,
      emailRedirectTo: siteUrl(),
      data: {
        full_name: fullName, phone: phone || null, signup_source: "host",
        host_agreement_version: currentVersions.hostAgreement.version,
        platform_terms_version: currentVersions.guestTerms.version,
        cancellation_policy_version: currentVersions.cancellationPolicy.version,
        privacy_notice_version: currentVersions.privacyNotice.version,
        host_agreement_accepted_at: acceptedAt,
      },
    },
  });
  if (error || !data.user) authError("/host/sign-up", "We couldn't create the account. Check the information and try again.", next);

  const admin = createAdminClient();
  const { error: acceptanceError } = await admin.from("host_terms_acceptances").insert({
    user_id: data.user.id,
    agreement_version: currentVersions.hostAgreement.version,
    platform_terms_version: currentVersions.guestTerms.version,
    cancellation_policy_version: currentVersions.cancellationPolicy.version,
    privacy_notice_version: currentVersions.privacyNotice.version,
    accepted_at: acceptedAt, user_agent: userAgent,
    review_evidence: {
      source: "host_signup", required_open_before_accept: true,
      opened: { host_agreement: true, platform_terms: true, cancellation_policy: true, privacy_notice: true },
      acceptance_statement: "I have opened and reviewed the current Host Agreement, Terms of Service, cancellation and refund policy, and Privacy Notice, and I agree to them as a Find A Place host.",
    },
  });
  if (acceptanceError) {
    console.error("[signUpHost] unable to record host terms acceptance", acceptanceError);
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    authError("/host/sign-up", "We couldn't save the host agreement acceptance. No host account was kept. Try again.", next);
  }
  if (data.session) redirect(next);
  const params = new URLSearchParams({ next });
  if (email) params.set("email", email);
  redirect(`/host/sign-up/check-email?${params.toString()}`);
}

export async function signInAdmin(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  if (!email || !password) authError("/admin/sign-in", "Enter your admin email and password.");
  const captchaToken = requireAuthCaptcha(formData, "/admin/sign-in");
  await clearLocalSupabaseSession();
  const client = await createClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error || !data.user) {
    await clearLocalSupabaseSession();
    authError("/admin/sign-in", "We couldn't sign you in with those credentials.");
  }
  const { data: isAdmin, error: adminError } = await client.rpc("is_active_admin");
  if (adminError || isAdmin !== true) {
    try { await client.auth.signOut(); } catch { /* Local cleanup is sufficient. */ }
    await clearLocalSupabaseSession();
    authError("/admin/sign-in", "This account does not have active Find A Place admin access.");
  }
  redirect("/admin");
}

export async function requestPasswordReset(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const portal = value(formData, "portal") === "admin" ? "admin" : "host";
  if (!email) recoveryError("/auth/password-reset", "Enter the email address for your account.", portal);
  const captchaToken = value(formData, "captcha_token");
  if (!captchaToken || captchaToken.length > 4096) recoveryError("/auth/password-reset", "Complete the security check before continuing.", portal);
  const client = await createClient();
  const redirectTo = `${siteUrl()}/auth/confirm?next=${encodeURIComponent(`/auth/update-password?portal=${portal}`)}`;
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo, captchaToken });
  if (error) console.error("[requestPasswordReset] Supabase request failed", error);
  redirect(`/auth/password-reset?${new URLSearchParams({ sent: "1", portal }).toString()}`);
}

export async function updatePassword(formData: FormData) {
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirm_password");
  const portal = value(formData, "portal") === "admin" ? "admin" : "host";
  if (password.length < 8) recoveryError("/auth/update-password", "Use a password with at least 8 characters.", portal);
  if (password !== confirmPassword) recoveryError("/auth/update-password", "The passwords don't match.", portal);
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims?.sub) recoveryError("/auth/password-reset", "That recovery session is invalid or expired. Request a new link.", portal);
  const { error } = await client.auth.updateUser({ password });
  if (error) recoveryError("/auth/update-password", "We couldn't update the password. Request a new recovery link and try again.", portal);
  try { await client.auth.signOut(); } finally { await clearLocalSupabaseSession(); }
  const destination = portal === "admin" ? "/admin/sign-in" : "/host/sign-in";
  redirect(`${destination}?saved=${encodeURIComponent("Password updated. Sign in with your new password.")}`);
}

async function signOut(destination: string) {
  try { const client = await createClient(); await client.auth.signOut(); }
  catch { /* A revoked refresh token must not prevent local logout. */ }
  finally { await clearLocalSupabaseSession(); }
  redirect(destination);
}
export async function signOutHost() { await signOut("/host/sign-in"); }
export async function signOutAdmin() { await signOut("/admin/sign-in"); }
