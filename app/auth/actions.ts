"use server";

import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function authError(path: string, message: string, next?: string): never {
  const params = new URLSearchParams({ error: message });
  if (next) params.set("next", next);
  redirect(`${path}?${params.toString()}`);
}

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

export async function signInHost(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const next = safeInternalPath(formData.get("next"), "/host");

  if (!email || !password) {
    authError("/host/sign-in", "Enter your email and password.", next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
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

  if (!fullName || !email || !password) {
    authError("/host/sign-up", "Name, email and password are required.", next);
  }

  if (password.length < 8) {
    authError("/host/sign-up", "Use a password with at least 8 characters.", next);
  }

  if (password !== confirmPassword) {
    authError("/host/sign-up", "The passwords don't match.", next);
  }

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
      },
    },
  });

  if (error) {
    authError("/host/sign-up", "We couldn't create the account. Check the information and try again.", next);
  }

  if (data.session) {
    redirect(next);
  }

  const params = new URLSearchParams({ next });
  if (email) params.set("email", email);
  redirect(`/host/sign-up/check-email?${params.toString()}`);
}

export async function signInAdmin(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");

  if (!email || !password) {
    authError("/admin/sign-in", "Enter your admin email and password.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    authError("/admin/sign-in", "We couldn't sign you in with those credentials.");
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_active_admin");

  if (adminError || isAdmin !== true) {
    await supabase.auth.signOut();
    authError("/admin/sign-in", "This account does not have active Find A Place admin access.");
  }

  redirect("/admin");
}

async function signOut(destination: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(destination);
}

export async function signOutHost() {
  await signOut("/host/sign-in");
}

export async function signOutAdmin() {
  await signOut("/admin/sign-in");
}
