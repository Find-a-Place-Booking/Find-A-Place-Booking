import { NextRequest } from "next/server";
import { mobileHeaders, mobileJson, readMobileObject } from "@/lib/mobile/http";
/** Adapts only fixed first-party trip handlers; retains their validation and notification logic. */
export async function mobileTripBridge(
  request: NextRequest,
  handler: (r: NextRequest) => Promise<Response>,
) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== request.nextUrl.origin &&
    !mobileHeaders(request)["Access-Control-Allow-Origin"]
  )
    return mobileJson(request, { error: "Invalid app origin." }, 403);
  const headers = new Headers(request.headers);
  headers.set("origin", request.nextUrl.origin);
  headers.set("referer", request.nextUrl.origin + "/trip");
  let body: string | undefined;
  if (request.method !== "GET") {
    const parsed = await readMobileObject(request);
    if (!parsed.ok) return parsed.response;
    const strings = [
      "confirmationCode",
      "email",
      "reservationId",
      "checkoutToken",
      "message",
      "requestText",
      "reason",
      "review",
    ];
    if (
      strings.some(
        (key) => key in parsed.body && typeof parsed.body[key] !== "string",
      ) ||
      ("rating" in parsed.body && typeof parsed.body.rating !== "number")
    )
      return mobileJson(
        request,
        { error: "Invalid booking request fields." },
        400,
      );
    body = JSON.stringify(parsed.body);
    headers.delete("content-length");
    headers.set("content-type", "application/json");
  }
  const forwarded = new NextRequest(request.url, {
    method: request.method,
    headers,
    body,
  });
  const result = await handler(forwarded);
  const response = new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
  for (const [key, value] of Object.entries(mobileHeaders(request)))
    response.headers.set(key, value);
  return response;
}
