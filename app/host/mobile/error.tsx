"use client";
import Link from "next/link";
export default function HostAppError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="shell" style={{ paddingBlock: 40, maxWidth: 700 }}>
      <section className="panel">
        <h1>We couldn't open your host app.</h1>
        <p>
          Your access or account details could not load. Try again in a moment.
        </p>
        <button className="button" onClick={reset}>
          Try again
        </button>
        <p>
          <Link href="/host">Open the regular host portal</Link>
        </p>
      </section>
    </main>
  );
}
