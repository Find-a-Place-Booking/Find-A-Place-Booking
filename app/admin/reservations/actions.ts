"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createConnectedRefund } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 5000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export async function issueReservationRefund(formData: FormData) {
  const context = await getAdminContext();

  const reservationId = field(formData, "reservation_id", 100);
  const refundType = field(formData, "refund_type", 20);
  const reason = field(formData, "reason", 500);
  const fullRefund = refundType === "full";
  const amountText = field(formData, "amount", 30);
  const amountCents = fullRefund
    ? 0
    : Math.round(Number.parseFloat(amountText) * 100);

  const fail = (message: string): never =>
    redirect(
      `/admin/reservations/${encodeURIComponent(
        reservationId,
      )}?error=${encodeURIComponent(message)}`,
    );

  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "FINANCE_ADMIN"])) {
    fail("Your admin role cannot issue refunds.");
  }

  if (
    !reservationId ||
    (!fullRefund && (!Number.isFinite(amountCents) || amountCents <= 0))
  ) {
    fail("Enter a valid partial refund amount.");
  }

  if (!reason) fail("Enter an internal refund reason.");

  const environment = stripeEnvironment();
  const admin = createAdminClient();

  const { data: reservation, error: reservationError } = await admin
    .from("reservations")
    .select("id,provider_account_ref,payment_environment")
    .eq("id", reservationId)
    .maybeSingle();

  const connectedAccountId = reservation?.provider_account_ref ?? null;

  if (reservationError || !connectedAccountId || !reservation) {
    fail("The reservation's connected Stripe account could not be resolved.");
  }

  if (reservation.payment_environment !== environment) {
    fail(
      `This reservation belongs to the ${reservation.payment_environment} Stripe environment, but this admin session is ${environment}.`,
    );
  }

  const { data, error } = await admin.rpc("create_refund_request", {
    target_reservation_id: reservationId,
    requested_amount_cents: amountCents,
    requested_full_refund: fullRefund,
    requested_reason: reason || null,
  });

  if (error || !data) {
    fail(error?.message || "The refund could not be prepared.");
  }

  const request = data as {
    refund_id: string;
    payment_id: string;
    provider_payment_id: string | null;
    amount_cents: number;
    platform_fee_refund_cents: number;
    is_full_refund: boolean;
    payment_environment: "TEST" | "LIVE";
  };

  if (request.payment_environment !== environment) {
    await admin.rpc("record_refund_result", {
      target_refund_id: request.refund_id,
      target_provider_refund_id: null,
      target_status: "FAILED",
      target_failure_message:
        "Refund environment did not match the active Stripe keys.",
    });

    fail("The refund belongs to a different Stripe environment.");
  }

  if (!request.provider_payment_id) {
    await admin.rpc("record_refund_result", {
      target_refund_id: request.refund_id,
      target_provider_refund_id: null,
      target_status: "FAILED",
      target_failure_message: "The Stripe payment reference is missing.",
    });

    fail("The Stripe payment reference is missing.");
  }

  let recordedStatus = "PENDING";

  try {
    const {
      refund,
      applicationFeeRefundStatus,
      applicationFeeRefundId,
      applicationFeeRefundError,
    } = await createConnectedRefund({
      connectedAccountId,
      paymentIntentId: request.provider_payment_id as string,
      refundId: request.refund_id,
      reservationId,
      amountCents: Number(request.amount_cents),
      fullRefund: request.is_full_refund,
      platformFeeRefundCents: Number(request.platform_fee_refund_cents),
      reason,
    });

    recordedStatus =
      refund.status === "succeeded"
        ? "SUCCEEDED"
        : refund.status === "failed"
          ? "FAILED"
          : refund.status === "canceled"
            ? "CANCELLED"
            : "PENDING";

    const { error: recordError } = await admin.rpc("record_refund_result", {
      target_refund_id: request.refund_id,
      target_provider_refund_id: refund.id,
      target_status: recordedStatus,
      target_failure_message: refund.failure_reason || null,
    });

    if (recordError) throw new Error(recordError.message);

    if (applicationFeeRefundStatus !== "PENDING") {
      const { error: feeRecordError } = await admin.rpc(
        "record_application_fee_refund_result",
        {
          target_refund_id: request.refund_id,
          target_status: applicationFeeRefundStatus,
          target_application_fee_refund_id: applicationFeeRefundId,
          target_error: applicationFeeRefundError,
        },
      );

      if (feeRecordError) {
        console.error(
          "[admin refund] application-fee result needs reconciliation",
          feeRecordError,
        );
      }
    }
  } catch (refundError) {
    await admin.rpc("record_refund_result", {
      target_refund_id: request.refund_id,
      target_provider_refund_id: null,
      target_status: "PENDING",
      target_failure_message:
        refundError instanceof Error
          ? refundError.message
          : "Stripe refund failed.",
    });

    fail(
      "The refund result is pending reconciliation. Do not submit another refund; refresh after Stripe retries the webhook.",
    );
  }

  revalidatePath(`/admin/reservations/${reservationId}`);

  redirect(
    `/admin/reservations/${encodeURIComponent(
      reservationId,
    )}?saved=${encodeURIComponent(
      recordedStatus === "SUCCEEDED"
        ? "Refund completed."
        : "Refund submitted to Stripe and is pending.",
    )}`,
  );
}

export async function addReservationSupportNote(formData: FormData) {
  const context = await getAdminContext();
  const reservationId = field(formData, "reservation_id", 100);
  const note = field(formData, "note");

  if (!reservationId || !note) {
    redirect(
      `/admin/reservations/${encodeURIComponent(
        reservationId,
      )}?error=${encodeURIComponent("Enter a support note first.")}`,
    );
  }

  const environment = stripeEnvironment();
  const supabase = await createClient();

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id,payment_environment")
    .eq("id", reservationId)
    .maybeSingle();

  if (
    reservationError ||
    !reservation ||
    reservation.payment_environment !== environment
  ) {
    redirect(
      `/admin/reservations?error=${encodeURIComponent(
        `That reservation is not part of the active ${environment} payment environment.`,
      )}`,
    );
  }

  const { error } = await supabase
    .from("reservation_support_notes")
    .insert({
      reservation_id: reservationId,
      admin_profile_id: context.profileId,
      note,
    });

  if (error) {
    console.error("[addReservationSupportNote]", error);

    redirect(
      `/admin/reservations/${encodeURIComponent(
        reservationId,
      )}?error=${encodeURIComponent(
        "The support note could not be saved.",
      )}`,
    );
  }

  revalidatePath(`/admin/reservations/${reservationId}`);

  redirect(
    `/admin/reservations/${encodeURIComponent(
      reservationId,
    )}?saved=${encodeURIComponent("Support note saved.")}`,
  );
}
