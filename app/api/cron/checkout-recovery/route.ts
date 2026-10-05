import { NextRequest, NextResponse } from "next/server";

import { closeUnfinishedReservationPayments } from "@/lib/bookings/checkout-recovery";
import { sendCheckoutRecoveryEmail } from "@/lib/notifications/checkout-recovery";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const environment = stripeEnvironment();
    const now = new Date();
    const nowIso = now.toISOString();

    const { error: expireError } = await admin.rpc(
      "service_expire_abandoned_holds",
    );

    if (expireError) {
      throw new Error(`Unable to expire old holds: ${expireError.message}`);
    }

    const { data: candidates, error } = await admin
      .from("reservations")
      .select(
        "id,status,payment_status,guest_email,hold_expires_at,checkout_recovery_eligible_at,provider_account_ref",
      )
      .eq("payment_environment", environment)
      .is("checkout_recovery_sent_at", null)
      .not("guest_email", "is", null)
      .lte("checkout_recovery_eligible_at", nowIso)
      .in("status", ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"])
      .order("checkout_recovery_eligible_at", { ascending: true })
      .limit(30);

    if (error) {
      throw new Error(`Unable to load checkout recovery queue: ${error.message}`);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const reservation of candidates ?? []) {
      try {
        if (
          reservation.payment_status === "SUCCEEDED" ||
          reservation.payment_status === "PROCESSING"
        ) {
          skipped += 1;
          continue;
        }

        const expired =
          reservation.status === "EXPIRED" ||
          !reservation.hold_expires_at ||
          new Date(reservation.hold_expires_at).getTime() <= now.getTime();

        if (!expired) {
          const { data: attempt } = await admin
            .from("booking_attempts")
            .select("last_event,last_seen_at")
            .eq("reservation_id", reservation.id)
            .order("last_seen_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const inactiveLongEnough =
            attempt?.last_seen_at &&
            new Date(attempt.last_seen_at).getTime() <=
              now.getTime() - 4 * 60 * 1000;

          if (
            !attempt ||
            attempt.last_event !== "booking_page_exit" ||
            !inactiveLongEnough
          ) {
            skipped += 1;
            continue;
          }
        } else {
          await closeUnfinishedReservationPayments({
            admin,
            reservationId: reservation.id,
            connectedAccountId: reservation.provider_account_ref,
          });
        }

        await sendCheckoutRecoveryEmail(admin, reservation.id);

        const { data: delivery } = await admin
          .from("notification_deliveries")
          .select("status,sent_at")
          .eq("reservation_id", reservation.id)
          .eq("notification_type", "CHECKOUT_RECOVERY")
          .eq("recipient", reservation.guest_email)
          .maybeSingle();

        if (delivery?.status === "SENT") {
          await admin
            .from("reservations")
            .update({
              checkout_recovery_sent_at:
                delivery.sent_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", reservation.id)
            .is("checkout_recovery_sent_at", null);

          sent += 1;
        } else {
          skipped += 1;
        }
      } catch (candidateError) {
        failed += 1;
        console.error(
          "[checkout recovery cron] candidate failed",
          reservation.id,
          candidateError,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      candidates: candidates?.length ?? 0,
      sent,
      skipped,
      failed,
    });
  } catch (error) {
    console.error("[checkout recovery cron]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout recovery cron failed.",
      },
      { status: 500 },
    );
  }
}
