import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cancellation Requests & Refunds",
  description: "Find A Place Booking cancellation request and refund policy information.",
  alternates: { canonical: "/cancellation-policy" },
  openGraph: {
    title: "Cancellation Requests & Refunds",
    description: "Find A Place Booking cancellation request and refund policy information.",
    url: "/cancellation-policy",
  },
};

export default function PublicRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
