import type { MetadataRoute } from "next";

import { CANONICAL_SITE_URL, absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Allow only the public social image endpoint within /api/.
        // Longest matching path wins, so private API paths stay disallowed.
        allow: ["/", "/api/public/stay-social-image/"],
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
