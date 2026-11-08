import Link from "next/link";

import styles from "./HostResourcesMenu.module.css";

/** Native <details> keeps the header menu accessible without extra client JS. */
export function HostResourcesMenu() {
  return (
    <details className={styles.menu}>
      <summary className={styles.trigger}>
        For hosts <span className={styles.chevron} aria-hidden="true" />
      </summary>
      <div className={styles.panel} aria-label="Host resources">
        <Link href="/hosts"><strong>List your property</strong><small>See how hosting works</small></Link>
        <Link href="/property-managers"><strong>Property managers</strong><small>List and manage multiple stays</small></Link>
        <Link href="/host/properties"><strong>Manage listings</strong><small>Your host workspace</small></Link>
        <Link href="/host/calendar"><strong>Calendars and sync</strong><small>Connect availability feeds</small></Link>
        <Link href="/host/help"><strong>Get host support</strong><small>Help with setup and bookings</small></Link>
      </div>
    </details>
  );
}
