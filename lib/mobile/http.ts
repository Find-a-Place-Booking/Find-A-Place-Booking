import { NextRequest, NextResponse } from "next/server";

/** Mobile APIs accept only the bundled Capacitor app origins (plus local dev). */
export function mobileHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowed = new Set([
    "capacitor://localhost",
    "http://localhost",
    "https://localhost",
  ]);
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
    headers["Access-Control-Allow-Headers"] =
      "Authorization, Content-Type, X-Fap-Organization";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  return headers;
}

export function mobileJson(request: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: mobileHeaders(request) });
}

export function mobileOptions(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: mobileHeaders(request),
  });
}

/** Bound request bytes before parsing; reject arrays, primitives and malformed JSON. */
export async function readMobileObject(
  request: NextRequest,
  maxBytes = 16_384,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  if (Number(request.headers.get("content-length") || 0) > maxBytes)
    return {
      ok: false,
      response: mobileJson(request, { error: "Request too large." }, 413),
    };
  const reader = request.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    if (reader) {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          return {
            ok: false,
            response: mobileJson(request, { error: "Request too large." }, 413),
          };
        }
        chunks.push(item.value);
      }
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(all));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("object required");
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: mobileJson(
        request,
        { error: "Send a valid JSON object." },
        400,
      ),
    };
  } finally {
    reader?.releaseLock();
  }
}
