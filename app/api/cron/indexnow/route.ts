import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitIndexNow } from "@/lib/seo/indexnow";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// A daily, limited batch of changed PUBLIC listings. Never accept arbitrary
// user-provided URLs; do not expose a public "submit any URL" endpoint.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const modifiedSince = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("properties")
    .select("id,updated_at,property_units!inner(slug,is_primary)")
    .eq("status", "PUBLISHED")
    .eq("property_units.is_primary", true)
    .gte("updated_at", modifiedSince)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[IndexNow] published listing lookup failed", error.code);
    return NextResponse.json({ error: "Could not verify changed published listings" }, { status: 503 });
  }

  const urls = (data || []).flatMap((row) => {
    const units = Array.isArray(row.property_units) ? row.property_units : [];
    return units
      .filter((unit) => unit.is_primary && typeof unit.slug === "string" && unit.slug.length)
      .map((unit) => absoluteUrl(`/stays/${encodeURIComponent(unit.slug)}`));
  });
  const result = await submitIndexNow(urls);
  return NextResponse.json({ ok: result.accepted, candidates: urls.length, ...result }, {
    status: result.accepted ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
