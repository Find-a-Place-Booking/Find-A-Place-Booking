"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendCancellationDecisionNotification } from "@/lib/notifications/cancellation-request-emails";
import { sendRefundNotifications } from "@/lib/notifications/operational-emails";
import {
  escapeHtml,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";
import {
  createGuestCheckoutToken,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import { createConnectedRefund } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 2000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function reservationPath(reservationId: string) {
  return `/host/reservations/${encodeURIComponent(reservationId)}`;
}

function fail(reservationId: string, message: string): never {
  redirect(
    `${reservationPath(reservationId)}?error=${encodeURIComponent(message)}`,
  );
}

function done(reservationId: string, message: string): never {
  redirect(
    `${reservationPath(reservationId)}?saved=${encodeURIComponent(message)}`,
  );
}

function refreshReservationViews(reservationId: string) {
  revalidatePath("/host/messages");
  revalidatePath(reservationPath(reservationId));
  revalidatePath("/host/reservations");
  revalidatePath("/host/calendar");
  revalidatePath("/host");
  revalidatePath("/admin/reservations");
}

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");
  return { supabase, profileId };
}

type CancellationRequestRow = {
  id: string;
  status: string;
  requested_by: string;
  metadata: Record<string, unknown> | null;
};

async function findOrCreateCancellationRequest(input: {
  admin: SupabaseClient;
  reservationId: string;
  profileId: string;
  reason: string;
  mode: "FULL_REFUND" | "NO_REFUND";
}) {
  const { data: existing, error: existingError } = await input.admin
    .from("reservation_cancellation_requests")
    .select("id,status,requested_by,metadata")
    .eq("reservation_id", input.reservationId)
    .in("status", ["REQUESTED", "APPROVED"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error("Unable to check existing cancellation requests.");
  }

  if (existing?.status === "APPROVED") {
    throw new Error(
      "A cancellation/refund is already processing for this reservation.",
    );
  }

  if (existing) {
    return existing as CancellationRequestRow;
  }

  const { data: created, error } = await input.admin
    .from("reservation_cancellation_requests")
    .insert({
      reservation_id: input.reservationId,
      requested_by: "HOST",
      status: "REQUESTED",
      reason: input.reason,
      metadata: {
        source: "host_initiated_reservation_action",
        mode: input.mode,
        initiated_by: input.profileId,
      },
    })
    .select("id,status,requested_by,metadata")
    .single();

  if (error || !created) {
    throw new Error("Unable to create the host cancellation record.");
  }

  return created as CancellationRequestRow;
}

async function withdrawHostCreatedRequest(
  admin: SupabaseClient,
  request: CancellationRequestRow,
  message: string,
) {
  if (request.requested_by !== "HOST") return;

  await admin
    .from("reservation_cancellation_requests")
    .update({
      status: "WITHDRAWN",
      metadata: {
        ...(request.metadata ?? {}),
        host_action_failed: true,
        host_action_failure: message.slice(0, 500),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "REQUESTED");
}

async function sendHostInitiatedCancellationEmail(
  admin: SupabaseClient,
  input: {
    reservationId: string;
    requestId: string;
    mode: "FULL_REFUND" | "NO_REFUND";
    reason: string;
    refundStatus?: string | null;
  },
) {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email,check_in,check_out",
    )
    .eq("id", input.reservationId)
    .single();

  if (error || !reservation?.guest_email) return;

  const [{ data: property }, { data: organization }] = await Promise.all([
    admin
      .from("properties")
      .select("name")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name")
      .eq("id", reservation.organization_id)
      .maybeSingle(),
  ]);

  const propertyName = property?.name || "your Find A Place stay";
  const hostName = organization?.name || propertyName;
  const token = createGuestCheckoutToken(reservation.id);
  const tripUrl = `${siteUrl()}/trip/${encodeURIComponent(
    reservation.confirmation_code,
  )}?reservationId=${encodeURIComponent(
    reservation.id,
  )}&checkoutToken=${encodeURIComponent(token)}`;

  const refundLine =
    input.mode === "NO_REFUND"
      ? "No guest refund was submitted through Find A Place."
      : input.refundStatus === "SUCCEEDED"
        ? "The remaining host-approved guest refund was submitted successfully. Your bank or card issuer controls when the credit appears."
        : "The remaining host-approved guest refund is being processed against the host's connected Stripe charge.";

  const cleanRequestId = input.requestId.replace(/[^a-zA-Z0-9]/g, "");

  await sendNotificationOnce({
    admin,
    reservationId: input.reservationId,
    type: `GUEST_HOST_CANCELLED_${input.mode}_${cleanRequestId}`,
    recipient: reservation.guest_email,
    subject: `Reservation cancelled: ${propertyName}`,
    text: [
      `${hostName} cancelled your reservation for ${propertyName}.`,
      `Confirmation: ${reservation.confirmation_code}`,
      `Dates: ${reservation.check_in} through ${reservation.check_out}`,
      `Host note: ${input.reason}`,
      refundLine,
      `Review your trip: ${tripUrl}`,
    ].join("\n"),
    html: `<p><strong>Reservation cancelled</strong></p>
      <p>${escapeHtml(hostName)} cancelled your reservation for
      <strong>${escapeHtml(propertyName)}</strong>.</p>
      <p><strong>Confirmation:</strong> ${escapeHtml(
        reservation.confirmation_code,
      )}<br><strong>Dates:</strong> ${escapeHtml(
        reservation.check_in,
      )} through ${escapeHtml(reservation.check_out)}</p>
      <p><strong>Host note:</strong><br>${escapeHtml(input.reason)}</p>
      <p>${escapeHtml(refundLine)}</p>
      <p><a href="${escapeHtml(tripUrl)}">Review your trip</a></p>`,
  });
}

async function notifyCancellation(
  admin: SupabaseClient,
  request: CancellationRequestRow,
  input: {
    reservationId: string;
    mode: "FULL_REFUND" | "NO_REFUND";
    reason: string;
    refundStatus?: string | null;
  },
) {
  if (request.requested_by === "GUEST") {
    await sendCancellationDecisionNotification(admin, {
      requestId: request.id,
      reservationId: input.reservationId,
      decision:
        input.mode === "FULL_REFUND" ? "APPROVED" : "APPROVED_NO_REFUND",
      hostResponse: input.reason,
      refundStatus: input.refundStatus ?? null,
    });
    return;
  }

  await sendHostInitiatedCancellationEmail(admin, {
    ...input,
    requestId: request.id,
  });
}

export async function hostCancelReservation(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const modeRaw = field(formData, "mode", 40);
  const reason = field(formData, "reason", 1200);
  const confirmed = field(formData, "confirm", 10) === "yes";

  const mode =
    modeRaw === "FULL_REFUND" || modeRaw === "NO_REFUND"
      ? modeRaw
      : null;

  if (!reservationId || !mode || !reason || !confirmed) {
    fail(
      reservationId,
      "Choose a cancellation option, add a reason, and confirm the action.",
    );
  }

  const { supabase, profileId } = await requireHost();

  // Host access is verified with the normal RLS client before any service-role work.
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select(
      "id,status,payment_status,payment_environment,provider_account_ref,confirmation_code,currency",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError || !reservation) {
    fail(reservationId, "Reservation not found or host access is unavailable.");
  }

  if (reservation.status !== "CONFIRMED") {
    fail(reservationId, "Only a confirmed reservation can be cancelled.");
  }

  const admin = createAdminClient();
  const environment = stripeEnvironment();

  if (
    mode === "FULL_REFUND" &&
    reservation.payment_environment !== environment
  ) {
    fail(
      reservationId,
      "This reservation belongs to a different Stripe environment.",
    );
  }

  if (mode === "FULL_REFUND" && !reservation.provider_account_ref) {
    fail(
      reservationId,
      "The connected host Stripe account is missing from this reservation.",
    );
  }

  let request: CancellationRequestRow;

  try {
    request = await findOrCreateCancellationRequest({
      admin,
      reservationId,
      profileId,
      reason,
      mode,
    });
  } catch (error) {
    fail(
      reservationId,
      error instanceof Error
        ? error.message
        : "Unable to prepare the cancellation.",
    );
  }

  if (mode === "NO_REFUND") {
    const { error } = await admin.rpc(
      "complete_host_cancellation_without_refund",
      {
        target_reservation_id: reservationId,
        target_request_id: request.id,
        target_host_response: reason,
        target_responded_by: profileId,
      },
    );

    if (error) {
      await withdrawHostCreatedRequest(admin, request, error.message);
      fail(
        reservationId,
        error.message || "The reservation could not be cancelled.",
      );
    }

    try {
      await notifyCancellation(admin, request, {
        reservationId,
        mode,
        reason,
      });
    } catch (notificationError) {
      console.error(
        "[host initiated cancellation] notification failed",
        reservationId,
        notificationError,
      );
    }

    refreshReservationViews(reservationId);
    done(
      reservationId,
      "Reservation cancelled, dates released, and no guest refund was submitted.",
    );
  }

  const { data: refundData, error: refundPrepareError } = await admin.rpc(
    "create_refund_request",
    {
      target_reservation_id: reservationId,
      requested_amount_cents: 0,
      requested_full_refund: true,
      requested_reason: `Host initiated cancellation. ${reason}`,
    },
  );

  if (refundPrepareError || !refundData) {
    await withdrawHostCreatedRequest(
      admin,
      request,
      refundPrepareError?.message || "Refund request could not be prepared.",
    );
    fail(
      reservationId,
      refundPrepareError?.message ||
        "The guest refund could not be prepared.",
    );
  }

  const refundRequest = refundData as {
    refund_id: string;
    payment_id: string;
    provider_payment_id: string | null;
    provider_charge_id: string | null;
    amount_cents: number;
    platform_fee_refund_cents: number;
    payment_environment: "TEST" | "LIVE";
  };

  if (!refundRequest.provider_payment_id) {
    await admin.rpc("record_refund_result", {
      target_refund_id: refundRequest.refund_id,
      target_provider_refund_id: null,
      target_status: "CANCELLED",
      target_failure_message: "The Stripe payment reference is missing.",
    });
    await withdrawHostCreatedRequest(
      admin,
      request,
      "The Stripe payment reference is missing.",
    );
    fail(reservationId, "The Stripe payment reference is missing.");
  }

  // Cancel and release inventory before waiting on Stripe refund completion.
  const { error: cancellationError } = await admin.rpc(
    "approve_host_cancellation_with_refund",
    {
      target_reservation_id: reservationId,
      target_request_id: request.id,
      target_refund_id: refundRequest.refund_id,
      target_host_response: reason,
      target_responded_by: profileId,
    },
  );

  if (cancellationError) {
    await admin.rpc("record_refund_result", {
      target_refund_id: refundRequest.refund_id,
      target_provider_refund_id: null,
      target_status: "CANCELLED",
      target_failure_message: cancellationError.message,
    });
    await withdrawHostCreatedRequest(
      admin,
      request,
      cancellationError.message,
    );
    fail(
      reservationId,
      cancellationError.message ||
        "The reservation could not be cancelled.",
    );
  }

  let recordedStatus:
    | "PENDING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED" = "PENDING";
  let providerRefundId: string | null = null;

  try {
    const result = await createConnectedRefund({
      connectedAccountId: reservation.provider_account_ref!,
      paymentIntentId: refundRequest.provider_payment_id,
      chargeId: refundRequest.provider_charge_id,
      refundId: refundRequest.refund_id,
      reservationId,
      amountCents: Number(refundRequest.amount_cents),
      fullRefund: true,
      platformFeeRefundCents: Number(
        refundRequest.platform_fee_refund_cents || 0,
      ),
      reason:
        "Host initiated reservation cancellation; Find A Place platform commission remains non-refundable.",
    });

    providerRefundId = result.refund.id;
    recordedStatus =
      result.refund.status === "succeeded"
        ? "SUCCEEDED"
        : result.refund.status === "failed"
          ? "FAILED"
          : result.refund.status === "canceled"
            ? "CANCELLED"
            : "PENDING";

    const { error: recordError } = await admin.rpc(
      "record_refund_result",
      {
        target_refund_id: refundRequest.refund_id,
        target_provider_refund_id: result.refund.id,
        target_status: recordedStatus,
        target_failure_message: result.refund.failure_reason || null,
      },
    );

    if (recordError) throw new Error(recordError.message);
  } catch (refundError) {
    await admin.rpc("record_refund_result", {
      target_refund_id: refundRequest.refund_id,
      target_provider_refund_id: providerRefundId,
      target_status: "PENDING",
      target_failure_message:
        refundError instanceof Error
          ? refundError.message
          : "Host refund is pending processor reconciliation.",
    });

    recordedStatus = "PENDING";
  }

  const { data: latestRequest } = await admin
    .from("reservation_cancellation_requests")
    .select("metadata")
    .eq("id", request.id)
    .maybeSingle();

  const now = new Date().toISOString();
  await admin
    .from("reservation_cancellation_requests")
    .update({
      status: recordedStatus === "SUCCEEDED" ? "COMPLETED" : "APPROVED",
      host_response: reason,
      responded_by: profileId,
      responded_at: now,
      completed_at: recordedStatus === "SUCCEEDED" ? now : null,
      metadata: {
        ...((latestRequest?.metadata as Record<string, unknown> | null) ?? {}),
        source:
          request.requested_by === "GUEST"
            ? "guest_request_host_approved"
            : "host_initiated_reservation_action",
        resolution:
          recordedStatus === "SUCCEEDED"
            ? "CANCELLED_REFUND_SUCCEEDED"
            : "CANCELLED_REFUND_PENDING",
        reservation_cancelled: true,
        calendar_released: true,
        refund_id: refundRequest.refund_id,
        provider_refund_id: providerRefundId,
        refund_status: recordedStatus,
        platform_commission_non_refundable: true,
      },
      updated_at: now,
    })
    .eq("id", request.id);

  try {
    await notifyCancellation(admin, request, {
      reservationId,
      mode,
      reason,
      refundStatus: recordedStatus,
    });
  } catch (notificationError) {
    console.error(
      "[host initiated cancellation] cancellation email failed",
      reservationId,
      notificationError,
    );
  }

  try {
    await sendRefundNotifications(admin, refundRequest.refund_id);
  } catch (notificationError) {
    console.error(
      "[host initiated cancellation] refund email failed",
      refundRequest.refund_id,
      notificationError,
    );
  }

  refreshReservationViews(reservationId);

  const refundCopy =
    recordedStatus === "SUCCEEDED"
      ? "The remaining guest refund completed."
      : recordedStatus === "FAILED" || recordedStatus === "CANCELLED"
        ? "The reservation is cancelled, but the refund needs attention."
        : "The reservation is cancelled and the refund is processing.";

  done(
    reservationId,
    `Reservation cancelled and dates released. ${refundCopy} Find A Place commission remains non-refundable.`,
  );
}
