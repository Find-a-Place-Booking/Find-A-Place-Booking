import type { Metadata } from "next";
import { Suspense } from "react";

import { HostDraftPersistence } from "@/components/HostDraftPersistence";
import { HostOnboardingFeedbackGate } from "@/components/HostOnboardingFeedbackGate";

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
      <Suspense fallback={null}>
        <HostOnboardingFeedbackGate />
      </Suspense>
      {children}
    </>
  );
}
