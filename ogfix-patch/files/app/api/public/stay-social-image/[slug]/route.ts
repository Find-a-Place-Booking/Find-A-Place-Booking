import { serveStaySocialImage } from "@/lib/public/serve-stay-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

// Preserve old preview URLs that might already be cached by crawlers.
export async function GET(_request: Request, { params }: Context) {
  return serveStaySocialImage((await params).slug, "GET");
}

export async function HEAD(_request: Request, { params }: Context) {
  return serveStaySocialImage((await params).slug, "HEAD");
}
