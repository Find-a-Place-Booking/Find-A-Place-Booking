import Link from "next/link";
import styles from "./AppInstallLinks.module.css";

/** Visible to all hosts; the existing access page enforces trial, subscription and partner entitlement. */
export function HostAppInstallNotice() {
  return (
    <section className={styles.hostAppNotice} aria-label="Find A Place Host web app">
      <span className={styles.hostAppGlyph} aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M10 18.5h4M9 6.5h6" /></svg>
      </span>
      <div className={styles.hostAppText}>
        <strong>Manage your stays from your phone</strong>
        <p>Get the Find A Place Host app for calendars, bookings and messages. Included for verified partners; trial or subscription options for other hosts.</p>
      </div>
      <Link className={styles.hostAppAction} href="/host/mobile">Get host app →</Link>
    </section>
  );
}
