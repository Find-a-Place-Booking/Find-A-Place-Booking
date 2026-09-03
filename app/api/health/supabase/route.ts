import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Development/operations smoke check for the Supabase foundation.
 *
 * The profiles table has RLS enabled with no public policies in Milestone 3, so
 * an anonymous select should return no rows while still proving that the app can
 * reach the expected project/schema. No secret values or database contents are
 * returned by this endpoint.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        configured: false,
        message: "Supabase environment variables are not configured.",
      },
      { status: 503 },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          service: "supabase",
          configured: true,
          message: "Supabase is reachable, but the foundation schema check failed.",
          code: error.code ?? null,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      service: "supabase",
      configured: true,
      schema: "foundation-v1",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        configured: true,
        message: "Supabase connection check failed.",
      },
      { status: 503 },
    );
  }
}
