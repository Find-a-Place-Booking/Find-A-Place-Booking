import Link from "next/link";

import { Brand } from "@/components/Brand";

export function AuthShell({
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-shell">
        <header className="auth-header">
          <Brand />
          <Link href="/">Back to marketplace →</Link>
        </header>
        <section className="auth-card">
          <div className="auth-copy">
            <p className="eyebrow dark">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{intro}</p>
          </div>
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </section>
      </div>
    </main>
  );
}
