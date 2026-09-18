import { NextResponse } from "next/server";

import { syncStripePaymentAccount } from "@/lib/payments/sync-stripe-account";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { organizationId?: string }
      | null;

    const organizationId = body?.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organization reference." },
        { status: 400 },
      );
    }

    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("organization_id,role,status")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("status", "ACTIVE")
      .in("role", ["OWNER", "MANAGER"])
      .maybeSingle();

    if (membershipError) {
      throw new Error(
        `Unable to verify host access: ${membershipError.message}`,
      );
    }

    if (!membership) {
      return NextResponse.json(
        { error: "Organization owner or manager access required." },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const environment = stripeEnvironment();

    const { data: paymentAccount, error: accountError } = await admin
      .from("payment_accounts")
      .select("id,provider_account_id")
      .eq("organization_id", organizationId)
      .eq("provider", "STRIPE")
      .eq("environment", environment)
      .neq("status", "DISABLED")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (accountError) {
      throw new Error(
        `Unable to load Stripe payment account: ${accountError.message}`,
      );
    }

    if (!paymentAccount?.provider_account_id) {
      return NextResponse.json(
        { error: "No Stripe payout account is connected yet." },
        { status: 404 },
      );
    }

    const result = await syncStripePaymentAccount(
      admin,
      paymentAccount.id,
      paymentAccount.provider_account_id,
    );

    return NextResponse.json({
      status: result.status,
      transfersEnabled: result.transfersEnabled,
      payoutsEnabled: result.payoutsEnabled,
      environment,
    });
  } catch (error) {
    console.error("[stripe connect sync]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh Stripe account status.",
      },
      { status: 500 },
    );
  }
}
