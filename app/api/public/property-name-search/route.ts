import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicStayRow = {
  slug: string;
  name: string;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
};

function locationFor(row: PublicStayRow) {
  return (
    row.public_area ||
    [row.city, row.region_code].filter(Boolean).join(", ") ||
    "Find A Place stay"
  );
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "")
    .trim()
    .slice(0, 80);

  if (query.length < 2) {
    return NextResponse.json({ matches: [] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_listing_index");

  if (error) {
    console.error("[property-name-search] public listing lookup failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ matches: [] });
  }

  const needle = query.toLocaleLowerCase();
  const rows = (data ?? []) as PublicStayRow[];

  const matches = rows
    .filter((row) => row.name?.toLocaleLowerCase().includes(needle))
    .sort((a, b) => {
      const aName = a.name.toLocaleLowerCase();
      const bName = b.name.toLocaleLowerCase();
      const aStarts = aName.startsWith(needle) ? 0 : 1;
      const bStarts = bName.startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || aName.localeCompare(bName);
    })
    .slice(0, 8)
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      location: locationFor(row),
    }));

  return NextResponse.json(
    { matches },
    {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
