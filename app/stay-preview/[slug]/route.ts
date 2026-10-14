// Public, bot-accessible alias to the existing authenticated-photo proxy.
// Keep the rendering, error handling and caching in one implementation.
// Unlike /api/, this route is allowed by the existing robots.txt rules.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { GET } from "@/app/api/public/stay-social-image/[slug]/route";
