import { NextRequest, NextResponse } from "next/server";

import { reservationVerificationReadiness } from "@/lib/bookings/guest-verification";
import { refreshUnitCalendarsOrThrow } from "@/lib/calendar/sync-ical";
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
  createDirectPaymentIntent,
  retrievePaymentIntent,
} from "@/lib/payments/stripe-checkout";
import { syncStripePaymentAccount } from "@/lib/payments/sync-stripe-account";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function missingDatabaseFunction(
  error: { code?: string; message?: string } | null,
) {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|does not exist/i.test(error.message || "")
  );
}

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
        "id,confirmation_code,unit_id,check_in,check_out,status,hold_expires_at,payment_status,guest_phone,guest_email_verified_at,stripe_identity_verification_session_id,identity_verification_status,identity_verified_at,guest_total_cents,tax_total_cents,platform_commission_cents,platform_tax_retained_cents,commission_rate_bps,currency,tax_status,payment_environment,payment_account_id,payment_provider,provider_account_ref",
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
        { error: "This stay does not have a ready Stripe payment account." },
        { status: 409 },
      );
    }

    const { data: account, error: accountError } = await admin
      .from("payment_accounts")
      .select(
        "id,status,environment,charges_enabled,provider_account_id,metadata",
      )
      .eq("id", reservation.payment_account_id)
      .single();

    const accountMetadata =
      account?.metadata && typeof account.metadata === "object"
        ? (account.metadata as Record<string, unknown>)
        : {};

    if (
      accountError ||
      !account ||
      account.environment !== environment ||
      accountMetadata.account_configuration !== "merchant" ||
      accountMetadata.charge_model !== "DIRECT" ||
      !account.provider_account_id ||
      account.provider_account_id !== reservation.provider_account_ref ||
      reservation.payment_environment !== environment
    ) {
      return NextResponse.json(
        { error: "The host Stripe payment account is not ready." },
        { status: 409 },
      );
    }

    let syncedStripe;
    try {
      syncedStripe = await syncStripePaymentAccount(
        admin,
        account.id,
        account.provider_account_id,
      );
    } catch (stripeSyncError) {
      console.error(
        "[booking payment-intent] Stripe readiness sync",
        stripeSyncError,
      );
      return NextResponse.json(
        {
          error:
            "The host payment account could not be verified. No payment was taken. Please try again shortly.",
        },
        { status: 409 },
      );
    }

    if (
      syncedStripe.status !== "READY" ||
      !syncedStripe.chargesEnabled ||
      !syncedStripe.payoutsEnabled
    ) {
      return NextResponse.json(
        {
          error:
            "The host payment account is temporarily unavailable. No payment was taken.",
        },
        { status: 409 },
      );
    }

    try {
      await refreshUnitCalendarsOrThrow(
        reservation.unit_id,
        {
          startDate: reservation.check_in,
          endDate: reservation.check_out,
        },
      );
    } catch (calendarError) {
      return NextResponse.json(
        {
          error: guestFacingBookingError(
            calendarError,
            "We could not verify the connected calendar. No payment was taken. Please try again in a moment.",
          ),
        },
        { status: 409 },
      );
    }

    const { error: resNexusReadinessError } = await admin.rpc(
      "service_assert_resnexus_unit_availability_ready",
      {
        target_unit_id: reservation.unit_id,
        target_check_in: reservation.check_in,
        target_check_out: reservation.check_out,
      },
    );

    if (
      resNexusReadinessError &&
      !missingDatabaseFunction(resNexusReadinessError)
    ) {
      return NextResponse.json(
        {
          error: guestFacingBookingError(
            resNexusReadinessError,
            "We could not verify the ResNexus calendar. No payment was taken. Please try again in a moment.",
          ),
        },
        { status: 409 },
      );
    }

    if (resNexusReadinessError) {
      console.info(
        "[booking payment-intent] dependency migration not visible yet; existing DB guard remains authoritative",
      );
    }

    const { data: liveBlocks, error: liveBlockError } = await admin
      .from("availability_blocks")
      .select("block_type,reservation_id,expires_at")
      .eq("unit_id", reservation.unit_id)
      .eq("state", "ACTIVE")
      .lt("start_date", reservation.check_out)
      .gt("end_date", reservation.check_in);

    if (liveBlockError) {
      throw new Error(
        "Unable to verify current availability before payment.",
      );
    }

    const blockNow = Date.now();
    const conflictingBlock = (liveBlocks ?? []).find(
      (block: {
        block_type: string;
        reservation_id: string | null;
        expires_at: string | null;
      }) => {
        if (
          block.block_type === "INTERNAL_HOLD" &&
          block.reservation_id === reservationId
        ) {
          return false;
        }

        if (
          block.block_type === "INTERNAL_HOLD" &&
          block.expires_at
        ) {
          const expiresAt = new Date(block.expires_at).getTime();
          if (!Number.isNaN(expiresAt) && expiresAt <= blockNow) {
            return false;
          }
        }

        return true;
      },
    );

    if (conflictingBlock) {
      return NextResponse.json(
        {
          error:
            "These dates changed while checkout was open. No payment was taken. Choose available dates and try again.",
        },
        { status: 409 },
      );
    }

    const amountCents = Number(reservation.guest_total_cents);
    const commissionCents = Number(reservation.platform_commission_cents);
    const guestTaxCents = Number(reservation.tax_total_cents || 0);

    const { data: claimedPayment, error: claimError } = await admin.rpc(
      "claim_stripe_payment_attempt",
      {
        target_reservation_id: reservationId,
        expected_environment: environment,
        // Direct charges make the connected merchant responsible for Stripe's
        // processing fee. Find A Place no longer recovers that fee.
        processor_fee_recovery_cents: 0,
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
      throw new Error("The Stripe merchant account changed during checkout.");
    }

    if (payment.provider_payment_id) {
      const intent = await retrievePaymentIntent(
        payment.provider_payment_id,
        payment.connected_account_id,
      );

      if (intent.status !== "canceled") {
        return NextResponse.json({
          reservationId,
          confirmationCode: reservation.confirmation_code,
          paymentId: payment.id,
          paymentIntentId: intent.id,
          paymentIntentStatus: intent.status,
          clientSecret: intent.client_secret,
          connectedAccountId: payment.connected_account_id,
          chargeModel: "DIRECT",
          amountCents: Number(payment.amount_cents),
          applicationFeeCents: Number(payment.application_fee_cents),
          processorFeeRecoveryCents: 0,
          holdExpiresAt: reservation.hold_expires_at,
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

    const intent = await createDirectPaymentIntent({
      amountCents,
      currency: reservation.currency,
      connectedAccountId: payment.connected_account_id,
      applicationFeeCents,
      reservationId,
      paymentId: payment.id,
      confirmationCode: reservation.confirmation_code,
      platformCommissionCents: commissionCents,
      guestTaxCents,
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
      .eq("id", payment.id)
      // The connected-account webhook can confirm the charge before this
      // request finishes. Never downgrade an already succeeded payment.
      .neq("status", "SUCCEEDED");

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
      .eq("id", reservationId)
      .in("status", ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"]);

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
      connectedAccountId: payment.connected_account_id,
      chargeModel: "DIRECT",
      amountCents,
      applicationFeeCents,
      platformCommissionCents: commissionCents,
      guestTaxCents,
      processorFeeRecoveryCents: 0,
      hostProceedsBeforeStripeFeeCents: Math.max(
        0,
        amountCents - applicationFeeCents,
      ),
      holdExpiresAt: extendedHold,
    });
  } catch (error) {
    console.error("[booking payment-intent]", error);

    return NextResponse.json(
      {
        error: guestFacingBookingError(
          error,
          "Unable to start secure payment. Refresh the booking and try again.",
        ),
      },
      { status: 500 },
    );
  }
}
