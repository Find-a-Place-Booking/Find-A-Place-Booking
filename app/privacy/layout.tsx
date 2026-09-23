import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy & Identity Verification Notice",
  description: "Find A Place Booking privacy, data handling and identity verification information.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy & Identity Verification Notice",
    description: "Find A Place Booking privacy, data handling and identity verification information.",
    url: "/privacy",
  },
};

export default function PublicRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
