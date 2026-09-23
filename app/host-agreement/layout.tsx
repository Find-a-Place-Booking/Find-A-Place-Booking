import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host Agreement",
  description: "Find A Place Booking agreement for hosts and property managers.",
  alternates: { canonical: "/host-agreement" },
  openGraph: {
    title: "Host Agreement",
    description: "Find A Place Booking agreement for hosts and property managers.",
    url: "/host-agreement",
  },
};

export default function PublicRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
