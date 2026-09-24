import { NextRequest, NextResponse } from "next/server";

import { sameOrigin } from "@/lib/payments/booking-runtime";

export const runtime = "nodejs";

const allowedEvents = new Set(["expired", "error"]);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    event?: string;
  } | null;

  const event = body?.event?.trim() || "";

  if (!allowedEvents.has(event)) {
    return NextResponse.json({ error: "Invalid security event." }, { status: 400 });
  }

  console.warn("[checkout security] Turnstile client event", {
    event,
    route: "/checkout",
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
