"use client";

import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const privatePrefixes = [
  "/admin",
  "/host",
  "/auth",
  "/checkout",
  "/trip",
  "/booking",
  "/api",
];

function sanitizedPublicUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const blocked = privatePrefixes.some(
      (prefix) =>
        url.pathname === prefix ||
        url.pathname.startsWith(`${prefix}/`),
    );

    if (blocked) return null;

    // Do not send destination/date/filter query strings to analytics.
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function VercelInsights() {
  return (
    <>
      <Analytics
        beforeSend={(event: BeforeSendEvent) => {
          const url = sanitizedPublicUrl(event.url);
          return url ? { ...event, url } : null;
        }}
      />

      <SpeedInsights
        beforeSend={(data) => {
          const url = sanitizedPublicUrl(data.url);
          return url ? { ...data, url } : null;
        }}
      />
    </>
  );
}
