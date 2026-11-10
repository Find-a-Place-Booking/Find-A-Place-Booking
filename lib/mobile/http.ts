import { NextRequest, NextResponse } from "next/server";

/** Mobile APIs accept only the bundled Capacitor app origins (plus local dev). */
export function mobileHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowed = new Set(["capacitor://localhost", "http://localhost", "https://localhost"]);
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:5173");
    allowed.add("http://localhost:5174");
  }
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Fap-Organization";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return headers;
}

export function mobileJson(request: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: mobileHeaders(request) });
}

export function mobileOptions(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: mobileHeaders(request) });
}
