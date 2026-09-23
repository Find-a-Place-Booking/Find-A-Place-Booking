import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  robots: { index: false, follow: true },
};

export default function LegacyAboutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
