import type { Metadata } from "next";
import { Suspense } from "react";

import { HostDraftSafeMount } from "@/components/HostDraftSafeMount";
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
      <HostDraftSafeMount />
      <Suspense fallback={null}>
        <HostOnboardingFeedbackGate />
      </Suspense>
      {children}
    </>
  );
}
