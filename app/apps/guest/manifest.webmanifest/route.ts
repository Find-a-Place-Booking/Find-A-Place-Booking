import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    id: "/apps/guest",
    name: "Find A Place Booking · Guest",
    short_name: "FAP Guest",
    start_url: "/apps/guest",
    scope: "/apps/guest",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#144f36",
    icons: [
      { src: "/webapps/icons/guest-192.png?v=20261123-dualcolor", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/webapps/icons/guest-512.png?v=20261123-dualcolor", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache, max-age=0" } });
}
