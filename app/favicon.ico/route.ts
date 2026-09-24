import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const filePath = path.join(
    process.cwd(),
    "public",
    "brand",
    "find-a-place-seal.png",
  );

  const image = await readFile(filePath);

  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control":
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}
