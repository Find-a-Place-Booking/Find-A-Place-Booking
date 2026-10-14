import type { Metadata } from "next";

import { InsuranceResourceNote } from "@/components/InsuranceResourceNote";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
};

export default function PrivateRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <InsuranceResourceNote provider="faye" placement="checkout" />
    </>
  );
}
