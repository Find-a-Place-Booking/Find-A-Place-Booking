import Link from "next/link";
import styles from "./AppInstallLinks.module.css";

/** All host owners/managers can access the separate host web app for free. */
export function HostAppInstallNotice() {
  return (
    <section className={styles.hostAppNotice} aria-label="Find A Place Host web app">
      <span className={styles.hostAppGlyph} aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M10 18.5h4M9 6.5h6" /></svg>
      </span>
      <div className={styles.hostAppText}>
        <strong>Your free host app, anywhere</strong>
        <p>Check bookings, calendars and guest messages on your phone. Free for every Find A Place host — no subscription or partner status required.</p>
      </div>
      <Link className={styles.hostAppAction} href="/host/mobile">Open free host app →</Link>
    </section>
  );
}
