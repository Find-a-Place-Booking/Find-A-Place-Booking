import type { Metadata } from "next";

import { HostDraftPersistence } from "@/components/HostDraftPersistence";

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
      <HostDraftPersistence />
      {children}
    </>
  );
}
