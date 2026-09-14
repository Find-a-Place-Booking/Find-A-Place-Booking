import { safeIcsFilename, serializeIcsCalendar, type IcsExportPayload } from "@/lib/calendar/ics-export";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.toLowerCase().endsWith(".ics") ? rawToken.slice(0, -4) : rawToken;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return new Response("Calendar not found.", { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_export_payload", { requested_token: token });
  if (error || !data) return new Response("Calendar not found.", { status: 404 });

  const payload = data as IcsExportPayload;
  return new Response(serializeIcsCalendar(payload), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${safeIcsFilename(payload.name)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
