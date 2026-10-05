import { NextRequest, NextResponse } from "next/server";

import { getPublishedStayCardsBySlugs } from "@/lib/public/stay-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("slugs") || "";
  const slugs = [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => SLUG_RE.test(value)),
    ),
  ].slice(0, 50);

  if (!slugs.length) {
    return NextResponse.json(
      { stays: [] },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }

  const stays = await getPublishedStayCardsBySlugs(slugs);

  return NextResponse.json(
    {
      stays,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
