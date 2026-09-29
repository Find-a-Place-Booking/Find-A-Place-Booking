import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  inboundBridgeToken,
  parseResNexusEmail,
  retrieveResendReceivedEmail,
  verifyResendWebhookSignature,
} from "@/lib/integrations/resnexus-email";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ResendReceivedEvent = {
  type?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    message_id?: string | null;
    subject?: string;
  };
};

function shortError(error: unknown) {
  return (
    (error instanceof Error ? error.message : "Unknown ResNexus bridge error")
      .trim()
      .slice(0, 1000)
  );
}

async function reconcileBridgeHealth(
  admin: SupabaseClient,
  bridge: { id: string; connection_id: string },
) {
  const { data: unresolved, error } = await admin
    .from("resnexus_inbound_events")
    .select("last_error,received_at")
    .eq("bridge_id", bridge.id)
    .in("status", ["NEEDS_REVIEW", "ERROR"])
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to reconcile ResNexus bridge health: ${error.message}`);
  }

  if (unresolved) {
    const message = String(
      unresolved.last_error || "A ResNexus email still needs review.",
    ).slice(0, 1000);
    const at = unresolved.received_at || new Date().toISOString();

    const [bridgeResult, connectionResult] = await Promise.all([
      admin
        .from("resnexus_email_bridges")
        .update({ last_error_at: at, last_error: message })
        .eq("id", bridge.id),
      admin
        .from("calendar_connections")
        .update({
          sync_status: "ERROR",
          last_error_at: at,
          last_error: message,
        })
        .eq("id", bridge.connection_id),
    ]);

    const updateError = bridgeResult.error ?? connectionResult.error;
    if (updateError) {
      throw new Error(`Unable to preserve ResNexus bridge error state: ${updateError.message}`);
    }
    return;
  }

  const [bridgeResult, connectionResult] = await Promise.all([
    admin
      .from("resnexus_email_bridges")
      .update({ last_error_at: null, last_error: null })
      .eq("id", bridge.id),
    admin
      .from("calendar_connections")
      .update({ last_error_at: null, last_error: null })
      .eq("id", bridge.connection_id),
  ]);

  const updateError = bridgeResult.error ?? connectionResult.error;
  if (updateError) {
    throw new Error(`Unable to clear ResNexus bridge error state: ${updateError.message}`);
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[resnexus email bridge] RESEND_WEBHOOK_SECRET missing");
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  const verified = verifyResendWebhookSignature({
    rawBody,
    webhookSecret,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });

  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: ResendReceivedEvent;
  try {
    event = JSON.parse(rawBody) as ResendReceivedEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const emailId = event.data?.email_id?.trim();
  if (!emailId) {
    return NextResponse.json({ error: "Received email ID is missing." }, { status: 400 });
  }

  const recipients = [
    ...(event.data?.to ?? []),
    ...(event.data?.cc ?? []),
    ...(event.data?.bcc ?? []),
  ];
  const token = inboundBridgeToken(recipients);
  if (!token) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const { data: bridge, error: bridgeError } = await admin
    .from("resnexus_email_bridges")
    .select("id,organization_id,unit_id,connection_id,status")
    .eq("inbound_token", token)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (bridgeError) {
    console.error("[resnexus email bridge] lookup failed", bridgeError);
    return NextResponse.json({ error: "Bridge lookup failed." }, { status: 500 });
  }
  if (!bridge) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: existing, error: existingError } = await admin
    .from("resnexus_inbound_events")
    .select("id,status")
    .eq("provider_email_id", emailId)
    .maybeSingle();

  if (existingError) {
    console.error("[resnexus email bridge] event lookup failed", existingError);
    return NextResponse.json({ error: "Inbound event lookup failed." }, { status: 500 });
  }

  let inboundEvent: { id: string } | null = null;

  if (existing) {
    // APPLIED/IGNORED are terminal. ERROR, RECEIVED and NEEDS_REVIEW may be
    // safely retried/replayed after a temporary provider error or a parser
    // improvement because the calendar write itself is idempotent by
    // connection_id + external_event_key.
    if (["APPLIED", "IGNORED"].includes(existing.status)) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        status: existing.status,
      });
    }

    inboundEvent = { id: existing.id };
    const { error: replayResetError } = await admin
      .from("resnexus_inbound_events")
      .update({
        status: "RECEIVED",
        last_error: null,
        processed_at: null,
      })
      .eq("id", existing.id);

    if (replayResetError) {
      console.error("[resnexus email bridge] replay reset failed", replayResetError);
      return NextResponse.json({ error: "Unable to replay inbound event." }, { status: 500 });
    }
  } else {
    const { data: createdEvent, error: eventError } = await admin
      .from("resnexus_inbound_events")
      .insert({
        bridge_id: bridge.id,
        provider_email_id: emailId,
        source_created_at: event.data?.created_at || null,
        message_id: event.data?.message_id?.slice(0, 500) || null,
        from_address: event.data?.from?.slice(0, 500) || null,
        subject: event.data?.subject?.slice(0, 500) || null,
        status: "RECEIVED",
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (eventError || !createdEvent) {
      // A race/replay can hit the unique email-id constraint between the first
      // lookup and this insert. Let the provider retry rather than risking a
      // duplicate availability write without an audit row.
      if (eventError?.code === "23505") {
        return NextResponse.json(
          { error: "Inbound event is already being processed." },
          { status: 409 },
        );
      }
      console.error("[resnexus email bridge] event insert failed", eventError);
      return NextResponse.json(
        { error: "Unable to reserve inbound event." },
        { status: 500 },
      );
    }

    inboundEvent = createdEvent;
  }

  if (!inboundEvent) {
    return NextResponse.json(
      { error: "Unable to reserve inbound event." },
      { status: 500 },
    );
  }
  const inboundEventId = inboundEvent.id;

  try {
    const email = await retrieveResendReceivedEmail(emailId);
    const parsed = parseResNexusEmail(email);

    const { error: lastEmailError } = await admin
      .from("resnexus_email_bridges")
      .update({ last_email_at: new Date().toISOString() })
      .eq("id", bridge.id);

    if (lastEmailError) {
      throw new Error(lastEmailError.message);
    }

    if (!parsed.ok) {
      const [eventResult, bridgeResult, connectionResult] = await Promise.all([
        admin
          .from("resnexus_inbound_events")
          .update({
            status: "NEEDS_REVIEW",
            reservation_reference: parsed.reservationReference,
            parsed_check_in: parsed.checkIn,
            parsed_check_out: parsed.checkOut,
            last_error: parsed.reason,
            processed_at: new Date().toISOString(),
          })
          .eq("id", inboundEventId),
        admin
          .from("resnexus_email_bridges")
          .update({
            last_error_at: new Date().toISOString(),
            last_error: parsed.reason,
          })
          .eq("id", bridge.id),
        admin
          .from("calendar_connections")
          .update({
            sync_status: "ERROR",
            last_sync_attempt_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error: parsed.reason,
          })
          .eq("id", bridge.connection_id),
      ]);

      const reviewWriteError =
        eventResult.error ?? bridgeResult.error ?? connectionResult.error;
      if (reviewWriteError) {
        throw new Error(reviewWriteError.message);
      }

      return NextResponse.json({
        ok: true,
        applied: false,
        needsReview: true,
      });
    }

    if (parsed.eventType === "CANCELLATION") {
      const { data: cancelResult, error } = await admin.rpc(
        "service_cancel_resnexus_email_block",
        {
          target_bridge_id: bridge.id,
          source_event_key: parsed.eventKey,
          event_metadata: {
            provider_email_id: emailId,
            message_id: email.message_id ?? event.data?.message_id ?? null,
          },
        },
      );

      if (error) throw new Error(error.message);

      const cancelledCount = Number(
        (cancelResult as { cancelled_count?: number } | null)?.cancelled_count || 0,
      );

      const { error: cancellationEventError } = await admin
        .from("resnexus_inbound_events")
        .update({
          status: cancelledCount > 0 ? "APPLIED" : "IGNORED",
          event_type: "CANCELLATION",
          reservation_reference: parsed.reservationReference,
          processed_at: new Date().toISOString(),
          last_error:
            cancelledCount > 0
              ? null
              : "Cancellation was valid, but no matching active ResNexus block existed.",
        })
        .eq("id", inboundEventId);

      if (cancellationEventError) {
        throw new Error(cancellationEventError.message);
      }
      await reconcileBridgeHealth(admin, bridge);

      return NextResponse.json({
        ok: true,
        applied: cancelledCount > 0,
        cancellation: true,
      });
    }

    // A cancellation is terminal for a reservation reference. If webhook
    // delivery/replay order is strange, an older confirmation must never be
    // allowed to reopen dates that a cancellation already released.
    const { data: cancellationAlreadySeen, error: cancellationLookupError } =
      await admin
        .from("resnexus_inbound_events")
        .select("id")
        .eq("bridge_id", bridge.id)
        .eq("event_type", "CANCELLATION")
        .eq("reservation_reference", parsed.reservationReference)
        .in("status", ["APPLIED", "IGNORED"])
        .limit(1)
        .maybeSingle();

    if (cancellationLookupError) {
      throw new Error(cancellationLookupError.message);
    }

    if (cancellationAlreadySeen) {
      const { error: ignoredEventError } = await admin
        .from("resnexus_inbound_events")
        .update({
          status: "IGNORED",
          event_type: "RESERVATION",
          reservation_reference: parsed.reservationReference,
          parsed_check_in: parsed.checkIn,
          parsed_check_out: parsed.checkOut,
          processed_at: new Date().toISOString(),
          last_error:
            "A cancellation for this ResNexus reservation reference was already received, so this late/replayed confirmation was not allowed to reopen the dates.",
        })
        .eq("id", inboundEventId);

      if (ignoredEventError) {
        throw new Error(ignoredEventError.message);
      }

      await reconcileBridgeHealth(admin, bridge);

      return NextResponse.json({
        ok: true,
        applied: false,
        ignored: true,
        reason: "cancellation_already_seen",
      });
    }

    const { error } = await admin.rpc("service_apply_resnexus_email_block", {
      target_bridge_id: bridge.id,
      source_event_key: parsed.eventKey,
      block_start: parsed.checkIn,
      block_end: parsed.checkOut,
      block_label: `ResNexus reservation ${parsed.reservationReference}`.slice(0, 180),
      event_metadata: {
        provider_email_id: emailId,
        message_id: email.message_id ?? event.data?.message_id ?? null,
        reservation_reference: parsed.reservationReference,
      },
    });

    if (error) throw new Error(error.message);

    const { error: reservationEventError } = await admin
      .from("resnexus_inbound_events")
      .update({
        status: "APPLIED",
        event_type: "RESERVATION",
        reservation_reference: parsed.reservationReference,
        parsed_check_in: parsed.checkIn,
        parsed_check_out: parsed.checkOut,
        last_error: null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", inboundEventId);

    if (reservationEventError) {
      throw new Error(reservationEventError.message);
    }
    await reconcileBridgeHealth(admin, bridge);

    return NextResponse.json({
      ok: true,
      applied: true,
      checkIn: parsed.checkIn,
      checkOut: parsed.checkOut,
    });
  } catch (error) {
    const message = shortError(error);

    await Promise.all([
      admin
        .from("resnexus_inbound_events")
        .update({
          status: "ERROR",
          last_error: message,
          processed_at: new Date().toISOString(),
        })
        .eq("id", inboundEventId),
      admin
        .from("resnexus_email_bridges")
        .update({
          last_error_at: new Date().toISOString(),
          last_error: message,
        })
        .eq("id", bridge.id),
      admin
        .from("calendar_connections")
        .update({
          sync_status: "ERROR",
          last_error_at: new Date().toISOString(),
          last_error: message,
        })
        .eq("id", bridge.connection_id),
    ]);

    console.error("[resnexus email bridge]", {
      bridgeId: bridge.id,
      providerEmailId: emailId,
      error: message,
    });

    // Return a retryable failure. Resend webhooks support retries/replays and
    // provider_email_id makes processing idempotent.
    return NextResponse.json({ error: "ResNexus email processing failed." }, { status: 500 });
  }
}
