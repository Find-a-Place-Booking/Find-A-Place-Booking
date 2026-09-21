import { NextRequest, NextResponse } from "next/server";

import { reservationVerificationReadiness } from "@/lib/bookings/guest-verification";
import { reservationPolicyReadiness } from "@/lib/policies/booking-policy";
import {
  guestCheckoutTokenMatches,
  guestFacingBookingError,
  requireBookingCheckout,
  requireLiveCheckoutDependencies,
  sameOrigin,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import {
  createDestinationPaymentIntent,
  estimatedHostProcessingRecoveryCents,
  retrievePaymentIntent,
} from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireBookingCheckout();

    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      reservationId?: string;
      checkoutToken?: string;
    };

    const reservationId = body.reservationId?.trim();
    const checkoutToken = body.checkoutToken?.trim();

    if (
      !reservationId ||
      !guestCheckoutTokenMatches(reservationId, checkoutToken)
    ) {
      return NextResponse.json(
        { error: "Booking access could not be verified." },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const environment = stripeEnvironment();
    requireLiveCheckoutDependencies();

    const { data: reservation, error: reservationError } = await admin
      .from("reservations")
      .select(
        "id,confirmation_code,status,hold_expires_at,payment_status,guest_phone,guest_email_verified_at,stripe_identity_verification_session_id,identity_verification_status,identity_verified_at,guest_total_cents,platform_commission_cents,commission_rate_bps,currency,tax_status,payment_environment,payment_account_id,payment_provider,provider_account_ref",
      )
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    if (reservation.status === "CONFIRMED") {
      return NextResponse.json({
        reservationId,
        confirmationCode: reservation.confirmation_code,
        reservationStatus: "CONFIRMED",
        paymentStatus: reservation.payment_status,
      });
    }

    if (
      !["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(
        reservation.status,
      )
    ) {
      return NextResponse.json(
        {
          error: `Reservation cannot be paid from status ${reservation.status}.`,
        },
        { status: 409 },
      );
    }

    if (
      reservation.hold_expires_at &&
      new Date(reservation.hold_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "This booking hold expired. Choose the dates again." },
        { status: 409 },
      );
    }

    // Payment creation is server-gated. The browser cannot skip required guest
    // verification and call Stripe directly: phone presence, email verification
    // and the Stripe Identity result are checked again here before any PaymentIntent
    // can be created or recovered.
    const verification = await reservationVerificationReadiness(
      admin,
      reservation,
    );

    if (!verification.ready) {
      return NextResponse.json(
        {
          error:
            verification.error ||
            "Complete guest verification before starting payment.",
          verificationRequired: true,
          emailVerified: verification.emailVerified,
          identityStatus: verification.identityStatus,
        },
        { status: 409 },
      );
    }

    const policyAcceptance = await reservationPolicyReadiness(
      admin,
      reservationId,
    );

    if (!policyAcceptance.ready) {
      return NextResponse.json(
        {
          error:
            policyAcceptance.error ||
            "Review and accept the booking policies before payment.",
          policyAcceptanceRequired: true,
          propertyOpened: policyAcceptance.propertyOpened,
          platformOpened: policyAcceptance.platformOpened,
          policyAccepted: policyAcceptance.accepted,
        },
        { status: 409 },
      );
    }

    // TEST and LIVE use the same marketplace tax calculation path.
    // LIVE remains stricter: the property jurisdiction must be finance-verified
    // before the hold can be created and paid.
    if (environment === "LIVE" && reservation.tax_status !== "CALCULATED") {
      return NextResponse.json(
        {
          error:
            "Live checkout is blocked until lodging-tax calculation is configured.",
        },
        { status: 409 },
      );
    }

    if (
      reservation.payment_provider !== "STRIPE" ||
      !reservation.payment_account_id ||
      !reservation.provider_account_ref
    ) {
      return NextResponse.json(
        { error: "This stay does not have a ready Stripe payout route." },
        { status: 409 },
      );
    }

    const { data: account, error: accountError } = await admin
      .from("payment_accounts")
      .select("id,status,environment,payouts_enabled,provider_account_id")
      .eq("id", reservation.payment_account_id)
      .single();

    if (
      accountError ||
      !account ||
      account.status !== "READY" ||
      account.environment !== environment ||
      !account.payouts_enabled ||
      !account.provider_account_id ||
      account.provider_account_id !== reservation.provider_account_ref ||
      reservation.payment_environment !== environment
    ) {
      return NextResponse.json(
        { error: "The host payout account is not ready." },
        { status: 409 },
      );
    }

    const amountCents = Number(reservation.guest_total_cents);
    const commissionCents = Number(reservation.platform_commission_cents);
    const processorFeeRecoveryCents =
      estimatedHostProcessingRecoveryCents(amountCents);

    const { data: claimedPayment, error: claimError } = await admin.rpc(
      "claim_stripe_payment_attempt",
      {
        target_reservation_id: reservationId,
        expected_environment: environment,
        processor_fee_recovery_cents: processorFeeRecoveryCents,
      },
    );

    if (claimError || !claimedPayment) {
      throw new Error(
        claimError?.message || "Unable to claim the Stripe payment attempt.",
      );
    }

    const payment = claimedPayment as {
      id: string;
      status: string;
      provider_payment_id: string | null;
      amount_cents: number;
      application_fee_cents: number;
      processor_fee_host_share_cents: number | null;
      connected_account_id: string;
    };

    if (payment.connected_account_id !== reservation.provider_account_ref) {
      throw new Error("The Stripe payout destination changed during checkout.");
    }

    if (payment?.provider_payment_id) {
      const intent = await retrievePaymentIntent(payment.provider_payment_id);

      if (intent.status !== "canceled") {
        return NextResponse.json({
          reservationId,
          confirmationCode: reservation.confirmation_code,
          paymentId: payment.id,
          paymentIntentId: intent.id,
          paymentIntentStatus: intent.status,
          clientSecret: intent.client_secret,
          amountCents: Number(payment.amount_cents),
          applicationFeeCents: Number(payment.application_fee_cents),
          processorFeeRecoveryCents: Number(
            payment.processor_fee_host_share_cents || 0,
          ),
        });
      }

      const { error: cancelError } = await admin
        .from("payments")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("id", payment.id)
        .neq("status", "SUCCEEDED");

      if (cancelError) throw new Error(cancelError.message);

      return NextResponse.json(
        {
          error:
            "The previous payment session was cancelled. Try again to start a fresh payment.",
        },
        { status: 409 },
      );
    }

    const applicationFeeCents = Number(payment.application_fee_cents);

    const intent = await createDestinationPaymentIntent({
      amountCents,
      currency: reservation.currency,
      connectedAccountId: payment.connected_account_id,
      applicationFeeCents,
      reservationId,
      paymentId: payment.id,
      confirmationCode: reservation.confirmation_code,
      platformCommissionCents: commissionCents,
      processorFeeRecoveryCents,
      commissionRateBps: Number(reservation.commission_rate_bps),
      paymentEnvironment: environment,
    });

    if (!intent.client_secret) {
      throw new Error("Stripe payment intent is missing a client secret.");
    }

    const extendedHold = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const now = new Date().toISOString();

    const { error: paymentUpdateError } = await admin
      .from("payments")
      .update({
        status:
          intent.status === "processing" ? "PROCESSING" : "REQUIRES_ACTION",
        provider_payment_id: intent.id,
        updated_at: now,
      })
      .eq("id", payment.id);

    if (paymentUpdateError) throw new Error(paymentUpdateError.message);

    const { error: reservationUpdateError } = await admin
      .from("reservations")
      .update({
        status: "PAYMENT_PENDING",
        payment_status:
          intent.status === "processing" ? "PROCESSING" : "REQUIRES_ACTION",
        hold_expires_at: extendedHold,
        updated_at: now,
      })
      .eq("id", reservationId);

    if (reservationUpdateError) throw new Error(reservationUpdateError.message);

    const { error: blockUpdateError } = await admin
      .from("availability_blocks")
      .update({
        expires_at: extendedHold,
        updated_at: now,
      })
      .eq("reservation_id", reservationId)
      .eq("state", "ACTIVE")
      .eq("block_type", "INTERNAL_HOLD");

    if (blockUpdateError) throw new Error(blockUpdateError.message);

    return NextResponse.json({
      reservationId,
      confirmationCode: reservation.confirmation_code,
      paymentId: payment.id,
      paymentIntentId: intent.id,
      paymentIntentStatus: intent.status,
      clientSecret: intent.client_secret,
      amountCents,
      applicationFeeCents,
      platformCommissionCents: commissionCents,
      processorFeeRecoveryCents,
      hostProceedsCents: Math.max(0, amountCents - applicationFeeCents),
    });
  } catch (error) {
    console.error("[booking payment-intent]", error);

    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to start secure payment. Refresh the booking and try again.",
          ),
      },
      { status: 500 },
    );
  }
}
