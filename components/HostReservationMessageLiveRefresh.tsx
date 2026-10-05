"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function HostReservationMessageLiveRefresh({
  aggressive = false,
}: {
  aggressive?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    const refreshSoon = () => {
      if (disposed || document.visibilityState === "hidden") return;
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }

      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, 140);
    };

    const channel = supabase
      .channel("host-reservation-message-refresh")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reservation_messages",
        },
        (payload) => {
          const senderType =
            payload.new && typeof payload.new === "object"
              ? String(
                  (payload.new as Record<string, unknown>).sender_type || "",
                )
              : "";

          // A host's own message is already reflected by the server action
          // redirect. Guest inserts are the ones that need to wake the inbox
          // and unread badges immediately.
          if (senderType === "GUEST") refreshSoon();
        },
      )
      .subscribe();

    const onFocus = () => refreshSoon();
    const onOnline = () => refreshSoon();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshSoon();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    const fallback = aggressive
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") {
            router.refresh();
          }
        }, 5_000)
      : null;

    return () => {
      disposed = true;
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }
      if (fallback !== null) window.clearInterval(fallback);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [aggressive, router, supabase]);

  return null;
}
