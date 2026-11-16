"use client";

import { usePathname } from "next/navigation";
import { HostDraftPersistence } from "@/components/HostDraftPersistence";

/**
 * Form-draft recovery belongs to onboarding only. Operational host pages have
 * controlled editors, repeated form labels, and live server-backed values.
 * Restoring a previous draft there can overwrite unrelated fields or revive
 * values that were already saved. Never mount that restoration system there.
 */
export function HostDraftSafeMount() {
  const pathname = usePathname();
  if (pathname !== "/host/onboarding" && !pathname.startsWith("/host/onboarding/")) {
    return null;
  }
  return <HostDraftPersistence />;
}
