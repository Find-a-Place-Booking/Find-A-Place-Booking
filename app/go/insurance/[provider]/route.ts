import { after, type NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// No user-controlled redirect URLs. These are the only supported destinations.
const DESTINATIONS = {
  faye: "https://www.withfaye.com/",
  proper: "https://www.proper.insure/",
} as const;

const PLACEMENTS = new Set([
  "checkout", "booking_confirmed", "my_trip", "host_help",
  "footer_guest", "footer_host",
]);

type Provider = keyof typeof DESTINATIONS;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!Object.prototype.hasOwnProperty.call(DESTINATIONS, provider)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const placement = request.nextUrl.searchParams.get("source") || "unknown";
  const safePlacement = PLACEMENTS.has(placement) ? placement : "unknown";

  // Count clicks after sending the redirect, so analytics cannot hold up a guest.
  // Deliberately store no identity, referrer, query string, IP, or reservation data.
  after(async () => {
    try {
      const { error } = await createAdminClient()
        .from("insurance_resource_clicks")
        .insert({ provider, placement: safePlacement });
      if (error) {
        console.warn("[insurance link] click tracking unavailable", {
          provider,
          placement: safePlacement,
          code: error.code,
        });
      }
    } catch {
      console.warn("[insurance link] click tracking unavailable", {
        provider,
        placement: safePlacement,
      });
    }
  });

  const response = NextResponse.redirect(DESTINATIONS[provider as Provider], 302);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
