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

const bookingFunnelPrefixes = [
  "/checkout",
  "/booking/confirmed",
];

function sanitizedAnalyticsEvent(event: BeforeSendEvent) {
  try {
    const url = new URL(event.url);
    const blocked = privatePrefixes.some(
      (prefix) =>
        url.pathname === prefix ||
        url.pathname.startsWith(`${prefix}/`),
    );

    if (!blocked) {
      url.search = "";
      url.hash = "";
      return { ...event, url: url.toString() };
    }

    /*
     * Keep private page views private, but allow the deliberately named custom
     * booking-funnel events from checkout/confirmation. Rewrite the event URL
     * to a neutral path so reservation IDs, checkout tokens and private route
     * details never reach Web Analytics.
     */
    const bookingFunnelEvent =
      event.type === "event" &&
      bookingFunnelPrefixes.some(
        (prefix) =>
          url.pathname === prefix ||
          url.pathname.startsWith(`${prefix}/`),
      );

    if (!bookingFunnelEvent) return null;

    url.pathname = "/booking-funnel";
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}

function sanitizedPublicUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const blocked = privatePrefixes.some(
      (prefix) =>
        url.pathname === prefix ||
        url.pathname.startsWith(`${prefix}/`),
    );

    if (blocked) return null;

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
      <Analytics beforeSend={sanitizedAnalyticsEvent} />

      <SpeedInsights
        beforeSend={(data) => {
          const url = sanitizedPublicUrl(data.url);
          return url ? { ...data, url } : null;
        }}
      />
    </>
  );
}
