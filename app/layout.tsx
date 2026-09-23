import type { Metadata } from "next";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import "./find-a-place-theme.css";
import "./contact-social-pass.css";
import "./accessibility-fixes.css";
import "./hero-video.css";
import "./mobile-ui-fixes.css";

import { JsonLd } from "@/components/JsonLd";
import { VercelInsights } from "@/components/VercelInsights";
import {
  CANONICAL_SITE_URL,
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
} from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "Find A Place Booking | Cabins, RV Stays & Getaways",
    template: "%s | Find A Place Booking",
  },
  description: DEFAULT_DESCRIPTION,
  category: "travel",
  keywords: [
    "cabins",
    "vacation rentals",
    "RV stays",
    "lake stays",
    "getaways",
    "independent stays",
    "Find A Place Booking",
  ],
  verification: {
    google: "G6WzRosMsXoi_gnlmUQhoKaJ8cmAVcr-g09DBsAEMAE",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: CANONICAL_SITE_URL,
    title: "Find A Place Booking | Cabins, RV Stays & Getaways",
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: "/brand/find-a-place-seal.png",
        alt: "Find A Place Booking",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find A Place Booking | Cabins, RV Stays & Getaways",
    description: DEFAULT_DESCRIPTION,
    images: ["/brand/find-a-place-seal.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/brand/find-a-place-seal.png",
    apple: "/brand/find-a-place-seal.png",
  },
};

const siteSchema = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: CANONICAL_SITE_URL,
    logo: absoluteUrl("/brand/find-a-place-seal.png"),
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: CANONICAL_SITE_URL,
    description: DEFAULT_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/stays")}?where={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <JsonLd data={siteSchema} />
        <VercelInsights />
      </body>
    </html>
  );
}
