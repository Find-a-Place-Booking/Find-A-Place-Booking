import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Property Policies",
  description: "How property-specific rules, cancellation terms and host policies work on Find A Place Booking.",
  alternates: { canonical: "/property-policies" },
  openGraph: {
    title: "Property Policies",
    description: "How property-specific rules, cancellation terms and host policies work on Find A Place Booking.",
    url: "/property-policies",
  },
};

export default function PublicRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
