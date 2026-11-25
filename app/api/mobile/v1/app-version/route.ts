import { WEBAPP_RELEASE, validRelease } from "@/lib/webapp/update";

export const dynamic = "force-dynamic";

// Intentionally public: contains no customer data or authentication information.
// Not routed through host authorization, and never cached by browsers or CDNs.
export function GET() {
  const headers = {
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
  return validRelease(WEBAPP_RELEASE)
    ? Response.json({ version: WEBAPP_RELEASE }, { headers })
    : Response.json({ error: "App version unavailable" }, { status: 503, headers });
}
