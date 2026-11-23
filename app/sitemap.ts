import type { MetadataRoute } from "next";

import { getPublishedSitemapSlugs } from "@/lib/public/sitemap-listings";
import { DESTINATIONS } from "@/lib/seo/destinations";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;

const staticRoutes: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/stays", priority: 0.95, changeFrequency: "daily" },
  { path: "/destinations", priority: 0.85, changeFrequency: "monthly" },
  { path: "/experiences", priority: 0.8, changeFrequency: "weekly" },
  { path: "/host-profiles", priority: 0.8, changeFrequency: "weekly" },
  { path: "/about", priority: 0.75, changeFrequency: "monthly" },
  { path: "/social", priority: 0.75, changeFrequency: "monthly" },
  { path: "/hosts", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
  { path: "/help", priority: 0.5, changeFrequency: "monthly" },
  { path: "/property-policies", priority: 0.35, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.25, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.25, changeFrequency: "monthly" },
  { path: "/cancellation-policy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/host-agreement", priority: 0.25, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await getPublishedSitemapSlugs();
  return [
    ...staticRoutes.map((route) => ({
      url: absoluteUrl(route.path),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...DESTINATIONS.map((place) => ({
      url: absoluteUrl(`/destinations/${place.slug}`),
      changeFrequency: "weekly" as const,
      priority: 0.82,
    })),
    ...slugs.map((slug) => ({
      url: absoluteUrl(`/stays/${encodeURIComponent(slug)}`),
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
  ];
}
