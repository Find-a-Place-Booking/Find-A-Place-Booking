"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  sendCancellationDecisionNotification,
} from "@/lib/notifications/cancellation-request-emails";
import { sendChangeDecisionNotification } from "@/lib/notifications/change-request-emails";
import { sendReservationMessageNotification } from "@/lib/notifications/message-emails";
import { sendRefundNotifications } from "@/lib/notifications/operational-emails";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createConnectedRefund } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 4000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function safeHostReturnPath(formData: FormData, reservationId: string) {
  const requested = field(formData, "return_to", 500);
  if (requested.startsWith("/host/") && !requested.startsWith("//")) {
    return requested;
  }
  return `/host/reservations/${encodeURIComponent(reservationId)}`;
}

function messageReturnPath(path: string) {
  const withoutHash = path.split("#", 1)[0];
  const separator = withoutHash.includes("?") ? "&" : "?";
  return `${withoutHash}${separator}sent=1#messages`;
}

function refreshReservationViews(reservationId: string) {
  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);
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

async function appendHostMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  reservationId: string,
  body: string,
) {
  let { data: conversation } = await supabase
    .from("reservation_conversations")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (!conversation) {
    const { data: created, error } = await supabase
      .from("reservation_conversations")
      .insert({ reservation_id: reservationId })
      .select("id")
      .single();

    if (error || !created) return null;
    conversation = created;
  }

  const { data: createdMessage, error } = await supabase
    .from("reservation_messages")
    .insert({
      conversation_id: conversation.id,
      reservation_id: reservationId,
      sender_type: "HOST",
      sender_profile_id: profileId,
      body,
    })
    .select("id")
    .single();

  if (error || !createdMessage) return null;

  await supabase
    .from("reservation_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  return createdMessage.id as string;
}

export async function sendHostReservationMessage(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const body = field(formData, "body");
  const returnTo = safeHostReturnPath(formData, reservationId);

  if (!reservationId || !body) {
    redirect(
      `/host/reservations/${encodeURIComponent(
        reservationId,
      )}?error=${encodeURIComponent("Enter a message first.")}`,
    );
  }

  const { supabase, profileId } = await requireHost();

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError || !reservation) {
    redirect("/host/reservations?result=error&detail=Reservation+not+found.");
  }

  const messageId = await appendHostMessage(
    supabase,
    profileId,
    reservationId,
    body,
  );

  if (!messageId) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The message could not be sent.",
      )}`,
    );
  }

  try {
    await sendReservationMessageNotification(createAdminClient(), {
      reservationId,
      messageId,
      senderType: "HOST",
      body,
    });
  } catch (notificationError) {
    console.error(
      "[host reservation message] email notification failed",
      messageId,
      notificationError,
    );
  }

  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);
  redirect(messageReturnPath(returnTo));
}

export async function declineCancellationRequest(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const requestId = field(formData, "request_id", 100);
  const enteredResponse = field(formData, "host_response", 1200);
  const response =
    enteredResponse ||
    "The host is keeping the reservation active under the cancellation terms accepted for this booking.";

  if (!reservationId || !requestId) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation request is missing.",
      )}`,
    );
  }

  const { supabase, profileId } = await requireHost();

  const [{ data: reservation }, { data: cancellationRequest }] =
    await Promise.all([
      supabase
        .from("reservations")
        .select("id,status")
        .eq("id", reservationId)
        .maybeSingle(),
      supabase
        .from("reservation_cancellation_requests")
        .select("id,status")
        .eq("id", requestId)
        .eq("reservation_id", reservationId)
        .maybeSingle(),
    ]);

  if (!reservation || !cancellationRequest) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation request could not be found.",
      )}`,
    );
  }

  if (cancellationRequest.status !== "REQUESTED") {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This cancellation request has already been answered.",
      )}`,
    );
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { error } = await admin
    .from("reservation_cancellation_requests")
    .update({
      status: "DECLINED",
      host_response: response,
      responded_by: profileId,
      responded_at: now,
    })
    .eq("id", requestId)
    .eq("status", "REQUESTED");

  if (error) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation response could not be saved.",
      )}`,
    );
  }

  await admin.from("reservation_events").insert({
    reservation_id: reservationId,
    event_type: "HOST_CANCELLATION_DECLINED",
    actor_profile_id: profileId,
    metadata: {
      cancellation_request_id: requestId,
      host_response: response,
    },
  });

  try {
    await sendCancellationDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "DECLINED",
      hostResponse: response,
    });
  } catch (notificationError) {
    console.error(
      "[decline cancellation] guest notification failed",
      notificationError,
    );
  }

  refreshReservationViews(reservationId);

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Cancellation request declined and the guest was notified.",
    )}`,
  );
}

export async function approveCancellationWithoutRefund(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const requestId = field(formData, "request_id", 100);
  const response = field(formData, "host_response", 1200);

  if (!reservationId || !requestId) {
    redirect(
      "/host/reservations?result=error&detail=Cancellation+request+missing.",
    );
  }

  const { supabase, profileId } = await requireHost();

  const [{ data: reservation }, { data: cancellationRequest }] =
    await Promise.all([
      supabase
        .from("reservations")
        .select("id,status")
        .eq("id", reservationId)
        .maybeSingle(),
      supabase
        .from("reservation_cancellation_requests")
        .select("id,status")
        .eq("id", requestId)
        .eq("reservation_id", reservationId)
        .maybeSingle(),
    ]);

  if (!reservation || !cancellationRequest) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation request could not be found.",
      )}`,
    );
  }

  if (
    reservation.status !== "CONFIRMED" ||
    cancellationRequest.status !== "REQUESTED"
  ) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This cancellation request is no longer awaiting a host decision.",
      )}`,
    );
  }

  const admin = createAdminClient();

  const { error: cancellationError } = await admin.rpc(
    "complete_host_cancellation_without_refund",
    {
      target_reservation_id: reservationId,
      target_request_id: requestId,
      target_host_response: response,
      target_responded_by: profileId,
    },
  );

  if (cancellationError) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation could not be completed. Check that migration 057 is applied.",
      )}`,
    );
  }

  try {
    await sendCancellationDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "APPROVED_NO_REFUND",
      hostResponse: response || null,
    });
  } catch (notificationError) {
    console.error(
      "[approve no-refund cancellation] guest notification failed",
      notificationError,
    );
  }

  refreshReservationViews(reservationId);

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Cancellation completed without a refund and the guest was notified.",
    )}`,
  );
}

export async function approveCancellationRequest(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const requestId = field(formData, "request_id", 100);
  const response = field(formData, "host_response", 1200);

  if (!reservationId || !requestId) {
    redirect(
      "/host/reservations?result=error&detail=Cancellation+request+missing.",
    );
  }

  const { supabase, profileId } = await requireHost();

  const [{ data: reservation }, { data: cancellationRequest }] =
    await Promise.all([
      supabase
        .from("reservations")
        .select(
          "id,status,payment_status,payment_environment,provider_account_ref,confirmation_code,currency,check_in,platform_commission_cents",
        )
        .eq("id", reservationId)
        .maybeSingle(),
      supabase
        .from("reservation_cancellation_requests")
        .select("id,status")
        .eq("id", requestId)
        .eq("reservation_id", reservationId)
        .maybeSingle(),
    ]);

  if (!reservation || !cancellationRequest) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation request could not be found.",
      )}`,
    );
  }

  if (reservation.status !== "CONFIRMED") {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "Only a confirmed reservation can be cancelled here.",
      )}`,
    );
  }

  if (cancellationRequest.status !== "REQUESTED") {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This cancellation request has already been answered.",
      )}`,
    );
  }

  if (!reservation.provider_account_ref) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The host Stripe account is missing from this reservation.",
      )}`,
    );
  }

  const admin = createAdminClient();
  const environment = stripeEnvironment();

  if (reservation.payment_environment !== environment) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This reservation belongs to a different Stripe environment.",
      )}`,
    );
  }

  // Prepare the refund record first. This does not call Stripe yet.
  const { data, error } = await admin.rpc("create_refund_request", {
    target_reservation_id: reservationId,
    requested_amount_cents: 0,
    requested_full_refund: true,
    requested_reason: `Host approved guest cancellation request ${requestId}.`,
  });

  if (error || !data) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        error?.message || "The refund could not be prepared.",
      )}`,
    );
  }

  const refundRequest = data as {
    refund_id: string;
    payment_id: string;
    provider_payment_id: string | null;
    provider_charge_id: string | null;
    amount_cents: number;
    platform_fee_refund_cents: number;
    platform_tax_refund_cents: number;
    platform_commission_refund_cents: number;
    commission_refund_eligible: boolean;
    days_before_check_in: number;
    payment_environment: "TEST" | "LIVE";
  };

  if (!refundRequest.provider_payment_id) {
    await admin.rpc("record_refund_result", {
      target_refund_id: refundRequest.refund_id,
      target_provider_refund_id: null,
      target_status: "CANCELLED",
      target_failure_message: "The Stripe payment reference is missing.",
    });

    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The Stripe payment reference is missing.",
      )}`,
    );
  }

  // Cancellation itself is now independent of processor timing. As soon as the
  // host approves it, the reservation becomes CANCELLED and its internal
  // calendar block is released atomically. The Stripe refund can then succeed,
  // remain pending or require reconciliation without keeping the dates blocked.
  const { data: cancellationResult, error: cancellationError } =
    await admin.rpc("approve_host_cancellation_with_refund", {
      target_reservation_id: reservationId,
      target_request_id: requestId,
      target_refund_id: refundRequest.refund_id,
      target_host_response: response,
      target_responded_by: profileId,
    });

  if (cancellationError || !cancellationResult) {
    await admin.rpc("record_refund_result", {
      target_refund_id: refundRequest.refund_id,
      target_provider_refund_id: null,
      target_status: "CANCELLED",
      target_failure_message:
        cancellationError?.message ||
        "The reservation cancellation transaction could not be completed.",
    });

    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        cancellationError?.message ||
          "The cancellation could not be completed. Check that migration 061 is applied.",
      )}`,
    );
  }

  const now = new Date().toISOString();
  let recordedStatus:
    | "PENDING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED" = "PENDING";
  let providerRefundId: string | null = null;

  let applicationFeeRefundStatus:
    | "NOT_REQUIRED"
    | "PENDING"
    | "SUCCEEDED"
    | "FAILED" =
    Number(refundRequest.platform_fee_refund_cents) > 0
      ? "PENDING"
      : "NOT_REQUIRED";
  let applicationFeeRefundId: string | null = null;
  let applicationFeeRefundError: string | null = null;

  try {
    const result = await createConnectedRefund({
      connectedAccountId: reservation.provider_account_ref,
      paymentIntentId: refundRequest.provider_payment_id,
      chargeId: refundRequest.provider_charge_id,
      refundId: refundRequest.refund_id,
      reservationId,
      amountCents: Number(refundRequest.amount_cents),
      fullRefund: true,
      platformFeeRefundCents: Number(
        refundRequest.platform_fee_refund_cents,
      ),
      reason:
        "Host approved guest refund; Find A Place platform commission remains non-refundable.",
    });

    const { refund } = result;

    providerRefundId = refund.id;
    applicationFeeRefundStatus = result.applicationFeeRefundStatus;
    applicationFeeRefundId = result.applicationFeeRefundId;
    applicationFeeRefundError = result.applicationFeeRefundError;

    recordedStatus =
      refund.status === "succeeded"
        ? "SUCCEEDED"
        : refund.status === "failed"
          ? "FAILED"
          : refund.status === "canceled"
            ? "CANCELLED"
            : "PENDING";

    const { error: recordError } = await admin.rpc(
      "record_refund_result",
      {
        target_refund_id: refundRequest.refund_id,
        target_provider_refund_id: refund.id,
        target_status: recordedStatus,
        target_failure_message: refund.failure_reason || null,
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
          : "Host-approved refund is pending processor reconciliation.",
    });

    recordedStatus = "PENDING";
  }

  if (applicationFeeRefundStatus !== "PENDING") {
    const { error: feeRecordError } = await admin.rpc(
      "record_application_fee_refund_result",
      {
        target_refund_id: refundRequest.refund_id,
        target_status: applicationFeeRefundStatus,
        target_application_fee_refund_id: applicationFeeRefundId,
        target_error: applicationFeeRefundError,
      },
    );

    if (feeRecordError) {
      console.error(
        "[approve cancellation] application-fee status needs reconciliation",
        feeRecordError,
      );
    }
  }

  await admin
    .from("reservation_cancellation_requests")
    .update({
      status: recordedStatus === "SUCCEEDED" ? "COMPLETED" : "APPROVED",
      host_response: response || null,
      responded_by: profileId,
      responded_at: now,
      completed_at: recordedStatus === "SUCCEEDED" ? now : null,
      metadata: {
        resolution:
          recordedStatus === "SUCCEEDED"
            ? "CANCELLED_REFUND_SUCCEEDED"
            : "CANCELLED_REFUND_PENDING",
        reservation_cancelled: true,
        calendar_released: true,
        refund_id: refundRequest.refund_id,
        provider_refund_id: providerRefundId,
        refund_status: recordedStatus,
        commission_refund_eligible:
          refundRequest.commission_refund_eligible,
        days_before_check_in: refundRequest.days_before_check_in,
        platform_commission_refund_cents:
          refundRequest.platform_commission_refund_cents,
        platform_tax_refund_cents:
          refundRequest.platform_tax_refund_cents,
        application_fee_refund_status: applicationFeeRefundStatus,
        application_fee_refund_id: applicationFeeRefundId,
        application_fee_refund_error: applicationFeeRefundError,
        source: "host_reservation",
      },
    })
    .eq("id", requestId);

  await admin.from("reservation_events").insert({
    reservation_id: reservationId,
    event_type: "HOST_CANCELLATION_REFUND_STATUS",
    actor_profile_id: profileId,
    metadata: {
      cancellation_request_id: requestId,
      refund_id: refundRequest.refund_id,
      refund_status: recordedStatus,
      reservation_cancelled: true,
      calendar_released: true,
      commission_refund_eligible:
        refundRequest.commission_refund_eligible,
      days_before_check_in: refundRequest.days_before_check_in,
      platform_commission_refund_cents:
        refundRequest.platform_commission_refund_cents,
      application_fee_refund_status: applicationFeeRefundStatus,
      host_response: response || null,
    },
  });

  try {
    await sendCancellationDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "APPROVED",
      hostResponse: response || null,
      refundStatus: recordedStatus,
    });
  } catch (notificationError) {
    console.error(
      "[approve cancellation] guest decision email failed",
      notificationError,
    );
  }

  try {
    await sendRefundNotifications(admin, refundRequest.refund_id);
  } catch (notificationError) {
    console.error(
      "[approve cancellation] refund email failed",
      notificationError,
    );
  }

  refreshReservationViews(reservationId);

  const feeCopy =
    "Find A Place commission remains earned and non-refundable; no application-fee refund is created.";

  const refundCopy =
    recordedStatus === "SUCCEEDED"
      ? "The guest refund completed."
      : recordedStatus === "FAILED" || recordedStatus === "CANCELLED"
        ? "The reservation is cancelled, but the guest refund needs attention."
        : "The reservation is cancelled and the guest refund is still processing.";

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      `Cancellation completed and the dates were released. ${refundCopy} ${feeCopy}`,
    )}`,
  );
}


export async function approveChangeRequest(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const requestId = field(formData, "request_id", 100);
  const enteredResponse = field(formData, "host_response", 1200);

  if (!reservationId || !requestId) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change request is missing.",
      )}`,
    );
  }

  const { supabase } = await requireHost();

  const [{ data: reservation }, { data: changeRequest }] =
    await Promise.all([
      supabase
        .from("reservations")
        .select("id,status")
        .eq("id", reservationId)
        .maybeSingle(),
      supabase
        .from("reservation_change_requests")
        .select("id,status")
        .eq("id", requestId)
        .eq("reservation_id", reservationId)
        .maybeSingle(),
    ]);

  if (!reservation || !changeRequest) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change request could not be found.",
      )}`,
    );
  }

  if (
    reservation.status !== "CONFIRMED" ||
    changeRequest.status !== "REQUESTED"
  ) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This change request is no longer waiting for a response.",
      )}`,
    );
  }

  const params = new URLSearchParams();
  if (enteredResponse) params.set("note", enteredResponse);

  redirect(
    `/host/reservations/${encodeURIComponent(
      reservationId,
    )}/change/${encodeURIComponent(requestId)}${
      params.size ? `?${params.toString()}` : ""
    }`,
  );
}

export async function applyChangeRequest(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const requestId = field(formData, "request_id", 100);
  const checkIn = field(formData, "check_in", 20);
  const checkOut = field(formData, "check_out", 20);
  const guestCountRaw = field(formData, "guest_count", 10);
  const petCountRaw = field(formData, "pet_count", 10);
  const enteredResponse = field(formData, "host_response", 1200);

  const guestCount = Number.parseInt(guestCountRaw, 10);
  const petCount = Number.parseInt(petCountRaw, 10);

  if (!reservationId || !requestId || !checkIn || !checkOut) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change request and updated dates are required.",
      )}`,
    );
  }

  const { supabase, profileId } = await requireHost();

  const [{ data: reservation }, { data: changeRequest }] =
    await Promise.all([
      supabase
        .from("reservations")
        .select("id,status,guest_count,pet_count")
        .eq("id", reservationId)
        .maybeSingle(),
      supabase
        .from("reservation_change_requests")
        .select("id,status")
        .eq("id", requestId)
        .eq("reservation_id", reservationId)
        .maybeSingle(),
    ]);

  if (!reservation || !changeRequest) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change request could not be found.",
      )}`,
    );
  }

  if (
    reservation.status !== "CONFIRMED" ||
    changeRequest.status !== "REQUESTED"
  ) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This change request is no longer waiting for a response.",
      )}`,
    );
  }

  const finalGuestCount = Number.isFinite(guestCount)
    ? guestCount
    : reservation.guest_count;
  const finalPetCount = Number.isFinite(petCount)
    ? petCount
    : reservation.pet_count;

  const summary =
    `Updated stay: ${checkIn} → ${checkOut}. ` +
    `Guests: ${finalGuestCount}. Pets: ${finalPetCount}.`;

  const response = enteredResponse
    ? `${enteredResponse} ${summary}`
    : `The host approved and applied this change. ${summary}`;

  const admin = createAdminClient();

  const { data, error } = await admin.rpc(
    "apply_host_reservation_change",
    {
      target_reservation_id: reservationId,
      target_change_request_id: requestId,
      target_check_in: checkIn,
      target_check_out: checkOut,
      target_guest_count: finalGuestCount,
      target_pet_count: finalPetCount,
      target_host_response: response,
      target_responded_by: profileId,
    },
  );

  if (error || !data) {
    redirect(
      `/host/reservations/${reservationId}/change/${requestId}?error=${encodeURIComponent(
        error?.message ||
          "The reservation change could not be applied.",
      )}`,
    );
  }

  try {
    await sendChangeDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "APPROVED",
      hostResponse: response,
    });
  } catch (notificationError) {
    console.error(
      "[apply change request] guest notification failed",
      notificationError,
    );
  }

  refreshReservationViews(reservationId);

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Change applied. The reservation and calendar are synchronized. The existing payment amount was not changed.",
    )}`,
  );
}

export async function declineChangeRequest(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const requestId = field(formData, "request_id", 100);
  const enteredResponse = field(formData, "host_response", 1200);
  const response =
    enteredResponse ||
    "The host cannot approve this change request. The existing reservation remains unchanged.";

  if (!reservationId || !requestId) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change request is missing.",
      )}`,
    );
  }

  const { supabase, profileId } = await requireHost();

  const { data: changeRequest } = await supabase
    .from("reservation_change_requests")
    .select("id,status")
    .eq("id", requestId)
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (!changeRequest) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change request could not be found.",
      )}`,
    );
  }

  if (changeRequest.status !== "REQUESTED") {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This change request has already been answered.",
      )}`,
    );
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { error } = await admin
    .from("reservation_change_requests")
    .update({
      status: "DECLINED",
      host_response: response,
      responded_by: profileId,
      responded_at: now,
      metadata: {
        resolution: "HOST_DECLINED_REQUEST",
        source: "host_reservation",
      },
    })
    .eq("id", requestId)
    .eq("status", "REQUESTED");

  if (error) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change response could not be saved.",
      )}`,
    );
  }

  await admin.from("reservation_events").insert({
    reservation_id: reservationId,
    event_type: "HOST_CHANGE_REQUEST_DECLINED",
    actor_profile_id: profileId,
    metadata: {
      change_request_id: requestId,
      host_response: response,
    },
  });

  try {
    await sendChangeDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "DECLINED",
      hostResponse: response,
    });
  } catch (notificationError) {
    console.error(
      "[decline change request] guest notification failed",
      notificationError,
    );
  }

  refreshReservationViews(reservationId);

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Change request declined and the guest was notified.",
    )}`,
  );
}

export async function respondToReservationReview(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const reviewId = field(formData, "review_id", 100);
  const response = field(formData, "response");

  if (!reservationId || !reviewId || !response) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "Enter a response first.",
      )}`,
    );
  }

  const { supabase, profileId } = await requireHost();

  const { error } = await supabase
    .from("reservation_reviews")
    .update({
      host_response: response,
      host_response_by: profileId,
      host_responded_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) {
    console.error("[respondToReservationReview]", error);

    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The review response could not be saved.",
      )}`,
    );
  }

  revalidatePath(`/host/reservations/${reservationId}`);
  revalidatePath("/stays");

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Review response saved.",
    )}`,
  );
}
