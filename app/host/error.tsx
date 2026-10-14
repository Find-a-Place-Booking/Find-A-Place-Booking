"use client";

import { useEffect } from "react";
import Link from "next/link";

/** Keep the host inside their portal when a transient upstream read fails. */
export default function HostPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No error.message or guest information in client logs.
    console.error("[host-portal] Page unavailable", {
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <main
      style={{
        maxWidth: 580,
        margin: "64px auto",
        padding: "24px",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ marginBottom: 12 }}>This page couldn’t load right now.</h1>
      <p>
        The connection may have been interrupted. Please try again. If you
        were making a booking or payment change, check its status before
        submitting the action a second time.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{ cursor: "pointer", padding: "10px 18px" }}
        >
          Try again
        </button>
        <Link href="/host/reservations">Return to reservations</Link>
      </div>
    </main>
  );
}
