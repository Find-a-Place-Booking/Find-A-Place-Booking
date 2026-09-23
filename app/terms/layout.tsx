import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Find A Place Booking platform and booking terms.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service",
    description: "Find A Place Booking platform and booking terms.",
    url: "/terms",
  },
};

export default function PublicRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
