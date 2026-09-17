import { NextRequest, NextResponse } from "next/server";

import { createConnectedAccountLink } from "@/lib/payments/stripe-api";
import { createClient } from "@/lib/supabase/server";

function siteUrl(request: NextRequest) {
  return (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const paymentAccountId = request.nextUrl.searchParams.get("payment_account_id");
  if (!paymentAccountId) {
    return NextResponse.redirect(new URL("/host/payments", request.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/host/sign-in", request.url));

  const { data: account } = await supabase
    .from("payment_accounts")
    .select("id,provider_account_id")
    .eq("id", paymentAccountId)
    .eq("provider", "STRIPE")
    .maybeSingle();

  if (!account?.provider_account_id) {
    return NextResponse.redirect(new URL("/host/payments?error=Stripe+account+not+found", request.url));
  }

  const base = siteUrl(request);
  const encoded = encodeURIComponent(account.id);
  const link = await createConnectedAccountLink({
    accountId: account.provider_account_id,
    refreshUrl: `${base}/host/payments/stripe/refresh?payment_account_id=${encoded}`,
    returnUrl: `${base}/host/payments/stripe/return?payment_account_id=${encoded}`,
  });

  return NextResponse.redirect(link.url);
}
