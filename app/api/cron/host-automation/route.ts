import { NextRequest, NextResponse } from "next/server";

import { runDueHostGuestAutomations } from "@/lib/notifications/host-guest-automations";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const guestEmails = await runDueHostGuestAutomations(admin);

    return NextResponse.json({
      ok: true,
      guestEmails,
    });
  } catch (error) {
    console.error("[host automation cron]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Host automation processing failed.",
      },
      { status: 500 },
    );
  }
}
