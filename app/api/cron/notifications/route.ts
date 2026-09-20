import { NextRequest, NextResponse } from "next/server";

import { sendBookingNotifications } from "@/lib/notifications/reservation-emails";
import { retryNotificationDelivery } from "@/lib/notifications/transactional-email";
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
    const { data, error } = await admin
      .from("notification_deliveries")
      .select("id,reservation_id,notification_type,attempt_count,status,subject")
      .eq("status", "FAILED")
      .lt("attempt_count", 5)
      .order("updated_at", { ascending: true })
      .limit(40);

    if (error) {
      throw new Error(`Unable to load failed emails: ${error.message}`);
    }

    let retried = 0;
    let recovered = 0;
    let failed = 0;
    let legacyRecovered = 0;
    const legacyReservations = new Set<string>();
    let index = 0;
    const rows = data ?? [];

    async function runner() {
      while (true) {
        const current = index++;
        if (current >= rows.length) return;
        const row = rows[current];
        retried += 1;

        try {
          const result = await retryNotificationDelivery(admin, row.id);
          if (result.legacy) {
            legacyReservations.add(row.reservation_id);
          } else if (result.sent) {
            recovered += 1;
          }
        } catch (retryError) {
          failed += 1;
          console.error(
            "[notification retry] persisted email retry failed",
            row.id,
            retryError,
          );
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(5, rows.length) }, () => runner()),
    );

    // Rows created before migration 047 do not contain the stored email body.
    // The only legacy notification path was booking confirmation, so rebuild it
    // once from the reservation snapshot instead of dropping those retries.
    for (const reservationId of legacyReservations) {
      try {
        const { data: reservation } = await admin
          .from("reservations")
          .select("id,status")
          .eq("id", reservationId)
          .maybeSingle();

        if (reservation?.status === "CONFIRMED") {
          await sendBookingNotifications(admin, reservationId);
          legacyRecovered += 1;
        }
      } catch (legacyError) {
        failed += 1;
        console.error(
          "[notification retry] legacy booking email retry failed",
          reservationId,
          legacyError,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      queuedDeliveries: rows.length,
      retried,
      recovered,
      legacyRecovered,
      failed,
    });
  } catch (error) {
    console.error("[notification retry cron]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Notification retry failed.",
      },
      { status: 500 },
    );
  }
}
