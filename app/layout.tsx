import type { Metadata } from "next";
import "./globals.css";
import "./find-a-place-theme.css";

export const metadata: Metadata = {
  title: "Find A Place Booking | Arkansas, Missouri & Beyond",
  description: "Find independent cabins, cottages, RV stays and one-of-a-kind places near the trips you want to take across Arkansas, Missouri and beyond.",
  icons: {
    icon: "/brand/find-a-place-seal.png",
    apple: "/brand/find-a-place-seal.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
