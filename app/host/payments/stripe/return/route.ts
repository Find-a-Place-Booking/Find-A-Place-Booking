import { NextRequest, NextResponse } from "next/server";

import { syncStripePaymentAccount } from "@/lib/payments/sync-stripe-account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function paymentsUrl(request: NextRequest, params?: Record<string, string>) {
  const url = new URL("/host/payments", request.url);
  Object.entries(params ?? {}).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return url;
}

export async function GET(request: NextRequest) {
  const paymentAccountId = request.nextUrl.searchParams.get("payment_account_id");
  if (!paymentAccountId) {
    return NextResponse.redirect(
      paymentsUrl(request, { error: "Missing payment account reference." }),
    );
  }

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    const signIn = new URL("/host/sign-in", request.url);
    signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  // This user-scoped read is intentional: RLS proves the signed-in host can
  // access this organization's payment account before the service client writes.
  const { data: paymentAccount, error } = await userClient
    .from("payment_accounts")
    .select("id,provider_account_id")
    .eq("id", paymentAccountId)
    .eq("provider", "STRIPE")
    .maybeSingle();

  if (error || !paymentAccount?.provider_account_id) {
    return NextResponse.redirect(
      paymentsUrl(request, {
        error: "That Stripe payout account is not available to this host.",
      }),
    );
  }

  try {
    const admin = createAdminClient();
    const { status } = await syncStripePaymentAccount(
      admin,
      paymentAccount.id,
      paymentAccount.provider_account_id,
    );

    return NextResponse.redirect(
      paymentsUrl(request, {
        stripe: status === "READY" ? "connected" : "pending",
      }),
    );
  } catch (syncError) {
    console.error("[stripe onboarding return] sync failed", syncError);
    return NextResponse.redirect(
      paymentsUrl(request, {
        error:
          syncError instanceof Error
            ? syncError.message
            : "Stripe account synchronization failed.",
      }),
    );
  }
}
