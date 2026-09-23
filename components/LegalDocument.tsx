import Link from "next/link";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import styles from "./LegalDocument.module.css";

function formatEffectiveDate(value?: string | null) {
  if (!value) return "September 19, 2026";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "September 19, 2026";
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

export function LegalDocument({
  eyebrow,
  title,
  version,
  effectiveAt,
  children,
}: {
  eyebrow: string;
  title: string;
  version: string;
  effectiveAt?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main className={styles.wrap}>
        <article className={`shell ${styles.article}`}>
          <p className="eyebrow dark">{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.meta}>
            Effective {formatEffectiveDate(effectiveAt)} · Version {version}
          </p>
          {children}
          <div className={styles.links}>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/host-agreement">Host Agreement</Link>
            <Link href="/cancellation-policy">Cancellation Policy</Link>
            <Link href="/privacy">Privacy Notice</Link>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}

export { styles as legalStyles };
