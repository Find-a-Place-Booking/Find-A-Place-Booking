import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Find A Place Booking for guest support, host support, platform help and optional property advertising.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact",
    description: "Contact Find A Place Booking for guest support, host support, platform help and optional property advertising.",
    url: "/contact",
  },
};

export default function PublicRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
