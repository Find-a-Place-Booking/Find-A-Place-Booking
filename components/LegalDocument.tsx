import Link from "next/link";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import styles from "./LegalDocument.module.css";

export function LegalDocument({
  eyebrow,
  title,
  version,
  children,
}: {
  eyebrow: string;
  title: string;
  version: string;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main className={styles.wrap}>
        <article className={`shell ${styles.article}`}>
          <p className="eyebrow dark">{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.meta}>Effective September 19, 2026 · Version {version}</p>
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
