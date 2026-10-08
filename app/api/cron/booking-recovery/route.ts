import { NextRequest, NextResponse } from "next/server";

import { runBookingRecoveryCron } from "@/lib/bookings/recovery-cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runBookingRecoveryCron(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[booking recovery cron]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Booking recovery cron failed.",
      },
      { status: 500 },
    );
  }
}
