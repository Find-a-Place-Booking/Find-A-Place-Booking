import type { MetadataRoute } from "next";

import { CANONICAL_SITE_URL, absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/host/",
          "/auth/",
          "/checkout",
          "/trip/",
          "/booking/",
          "/api/",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: CANONICAL_SITE_URL,
  };
}
