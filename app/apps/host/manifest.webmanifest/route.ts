import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    id: "/apps/host",
    name: "Find A Place Booking · Host",
    short_name: "FAP Host",
    start_url: "/host/mobile/workspace",
    scope: "/host/mobile",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#263e34",
    icons: [
      { src: "/webapps/icons/host-192.png?v=20261125-white", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/webapps/icons/host-512.png?v=20261125-white", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache, max-age=0, must-revalidate" } });
}
