import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand-compact" : ""}`} href="/">
      <span className="brand-mark" aria-hidden="true"><span /></span>
      <span className="brand-copy"><strong>Find A Place</strong><small>Booking · Arkansas, Missouri & beyond</small></span>
    </Link>
  );
}
