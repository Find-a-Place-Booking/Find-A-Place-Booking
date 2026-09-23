import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help & Support",
  description: "Find help for Find A Place Booking reservations, guest trips, host accounts, listings and platform support.",
  alternates: { canonical: "/help" },
  openGraph: {
    title: "Help & Support",
    description: "Find help for Find A Place Booking reservations, guest trips, host accounts, listings and platform support.",
    url: "/help",
  },
};

export default function PublicRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
