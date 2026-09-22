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
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id,status")
    .eq("id", reservationId)
    .maybeSingle();

  const { data: cancellationRequest } = await supabase
    .from("reservation_cancellation_requests")
    .select("id,status")
    .eq("id", requestId)
    .eq("reservation_id", reservationId)
    .maybeSingle();

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
    metadata: { cancellation_request_id: requestId, host_response: response },
  });


  try {
    await sendCancellationDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "DECLINED",
      hostResponse: response,
    });
  } catch (notificationError) {
    console.error("[decline cancellation] guest notification failed", notificationError);
  }

  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);
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
    redirect("/host/reservations?result=error&detail=Cancellation+request+missing.");
  }

  const { supabase, profileId } = await requireHost();
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id,status")
    .eq("id", reservationId)
    .maybeSingle();

  const { data: cancellationRequest } = await supabase
    .from("reservation_cancellation_requests")
    .select("id,status")
    .eq("id", requestId)
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (!reservation || !cancellationRequest) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation request could not be found.",
      )}`,
    );
  }

  if (reservation.status !== "CONFIRMED" || cancellationRequest.status !== "REQUESTED") {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This cancellation request is no longer awaiting a host decision.",
      )}`,
    );
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { error: requestUpdateError } = await admin
    .from("reservation_cancellation_requests")
    .update({
      status: "COMPLETED",
      host_response: response || null,
      responded_by: profileId,
      responded_at: now,
      completed_at: now,
      metadata: {
        resolution: "NO_REFUND",
        source: "host_reservation",
      },
    })
    .eq("id", requestId)
    .eq("status", "REQUESTED");

  if (requestUpdateError) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The cancellation decision could not be saved.",
      )}`,
    );
  }

  const { error: reservationUpdateError } = await admin
    .from("reservations")
    .update({
      status: "CANCELLED",
      cancelled_at: now,
      updated_at: now,
    })
    .eq("id", reservationId)
    .eq("status", "CONFIRMED");

  if (reservationUpdateError) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The reservation could not be cancelled.",
      )}`,
    );
  }

  await admin
    .from("availability_blocks")
    .update({ state: "CANCELLED", updated_at: now })
    .eq("reservation_id", reservationId)
    .eq("state", "ACTIVE")
    .in("block_type", ["INTERNAL_HOLD", "INTERNAL_RESERVATION"]);

  await admin.from("reservation_events").insert({
    reservation_id: reservationId,
    event_type: "HOST_CANCELLATION_APPROVED_NO_REFUND",
    actor_profile_id: profileId,
    metadata: {
      cancellation_request_id: requestId,
      resolution: "NO_REFUND",
      host_response: response || null,
    },
  });


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

  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);
  revalidatePath("/host/reservations");

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
    redirect("/host/reservations?result=error&detail=Cancellation+request+missing.");
  }

  const { supabase, profileId } = await requireHost();
  const { data: reservation } = await supabase
    .from("reservations")
    .select(
      "id,status,payment_status,payment_environment,provider_account_ref,confirmation_code,currency",
    )
    .eq("id", reservationId)
    .maybeSingle();

  const { data: cancellationRequest } = await supabase
    .from("reservation_cancellation_requests")
    .select("id,status")
    .eq("id", requestId)
    .eq("reservation_id", reservationId)
    .maybeSingle();

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
    amount_cents: number;
    platform_fee_refund_cents: number;
    payment_environment: "TEST" | "LIVE";
  };

  if (!refundRequest.provider_payment_id) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The Stripe payment reference is missing.",
      )}`,
    );
  }

  const now = new Date().toISOString();
  let recordedStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" = "PENDING";
  let providerRefundId: string | null = null;

  try {
    const { refund } = await createConnectedRefund({
      connectedAccountId: reservation.provider_account_ref,
      paymentIntentId: refundRequest.provider_payment_id,
      refundId: refundRequest.refund_id,
      reservationId,
      amountCents: Number(refundRequest.amount_cents),
      fullRefund: true,
      platformFeeRefundCents: Number(refundRequest.platform_fee_refund_cents),
      reason: "Host approved guest cancellation request",
    });

    providerRefundId = refund.id;
    recordedStatus =
      refund.status === "succeeded"
        ? "SUCCEEDED"
        : refund.status === "failed"
          ? "FAILED"
          : refund.status === "canceled"
            ? "CANCELLED"
            : "PENDING";

    const { error: recordError } = await admin.rpc("record_refund_result", {
      target_refund_id: refundRequest.refund_id,
      target_provider_refund_id: refund.id,
      target_status: recordedStatus,
      target_failure_message: refund.failure_reason || null,
    });
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

  await admin
    .from("reservation_cancellation_requests")
    .update({
      status: recordedStatus === "SUCCEEDED" ? "COMPLETED" : "APPROVED",
      host_response: response || null,
      responded_by: profileId,
      responded_at: now,
      completed_at: recordedStatus === "SUCCEEDED" ? now : null,
      metadata: {
        refund_id: refundRequest.refund_id,
        provider_refund_id: providerRefundId,
        refund_status: recordedStatus,
        source: "host_reservation",
      },
    })
    .eq("id", requestId);

  await admin.from("reservation_events").insert({
    reservation_id: reservationId,
    event_type: "HOST_CANCELLATION_APPROVED",
    actor_profile_id: profileId,
    metadata: {
      cancellation_request_id: requestId,
      refund_id: refundRequest.refund_id,
      refund_status: recordedStatus,
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
    console.error("[approve cancellation] guest decision email failed", notificationError);
  }

  try {
    await sendRefundNotifications(admin, refundRequest.refund_id);
  } catch (notificationError) {
    console.error("[approve cancellation] refund email failed", notificationError);
  }

  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);
  revalidatePath("/host/reservations");

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      recordedStatus === "SUCCEEDED"
        ? "Cancellation approved. The full refund was submitted and the guest was notified."
        : "Cancellation approved. The refund is processing and the guest was notified.",
    )}`,
  );
}


export async function approveChangeRequest(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const requestId = field(formData, "request_id", 100);
  const enteredResponse = field(formData, "host_response", 1200);
  const response =
    enteredResponse ||
    "The host approved this change request. Confirm the updated reservation details before relying on any date, guest-count or price change.";

  if (!reservationId || !requestId) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The change request is missing.",
      )}`,
    );
  }

  const { supabase, profileId } = await requireHost();
  const [{ data: reservation }, { data: changeRequest }] = await Promise.all([
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

  if (reservation.status !== "CONFIRMED" || changeRequest.status !== "REQUESTED") {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "This change request is no longer waiting for a response.",
      )}`,
    );
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin
    .from("reservation_change_requests")
    .update({
      status: "APPROVED",
      host_response: response,
      responded_by: profileId,
      responded_at: now,
      metadata: {
        resolution: "HOST_APPROVED_REQUEST",
        automatic_reservation_mutation: false,
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
    event_type: "HOST_CHANGE_REQUEST_APPROVED",
    actor_profile_id: profileId,
    metadata: { change_request_id: requestId, host_response: response },
  });

  try {
    await sendChangeDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "APPROVED",
      hostResponse: response,
    });
  } catch (notificationError) {
    console.error("[approve change request] guest notification failed", notificationError);
  }

  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);
  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Change request approved and the guest was notified.",
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
    metadata: { change_request_id: requestId, host_response: response },
  });

  try {
    await sendChangeDecisionNotification(admin, {
      requestId,
      reservationId,
      decision: "DECLINED",
      hostResponse: response,
    });
  } catch (notificationError) {
    console.error("[decline change request] guest notification failed", notificationError);
  }

  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);
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
