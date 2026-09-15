import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="Find A Place home">
      <img className="brand-seal" src="/brand/find-a-place-seal.png" alt="" aria-hidden="true" />
      <span className="brand-copy">
        <strong>Find A Place</strong>
        <small>{compact ? "Booking" : "Booking · Arkansas, Missouri & beyond"}</small>
      </span>
    </Link>
  );
}
