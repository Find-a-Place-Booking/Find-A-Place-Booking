import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Find A Place Booking — Stays in Arkansas, Missouri & Beyond",
  description: "Discover and book independent stays across Arkansas, Missouri and the surrounding region."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
