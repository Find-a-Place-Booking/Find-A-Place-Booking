import styles from "./CalendarIntegrationPanel.module.css";

export function CalendarIntegrationPanel() {
  return (
    <section className={styles.panel} aria-labelledby="booking-system-integrations">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Booking system integrations</p>
          <h2 id="booking-system-integrations">Connect the system you already use</h2>
        </div>
        <p>
          Direct integrations can sync richer booking data. iCal remains the
          availability-only fallback for systems that support calendar feeds.
        </p>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <strong>ThinkReservations</strong>
              <span>Direct PMS API</span>
            </div>
            <span className={`${styles.badge} ${styles.next}`}>Next up</span>
          </div>
          <p>
            Direct room, reservation and availability sync. This is the first
            full PMS connector we are building.
          </p>
          <details className={styles.guide}>
            <summary>What hosts will need</summary>
            <ol>
              <li>Open ThinkReservations and go to Settings → API Keys.</li>
              <li>Create a Restricted API Key for Find A Place Booking.</li>
              <li>Have the Hotel ID and restricted key ready when the connector opens.</li>
            </ol>
          </details>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <strong>Guesty</strong>
              <span>iCal now · direct channel later</span>
            </div>
            <span className={`${styles.badge} ${styles.live}`}>iCal available</span>
          </div>
          <p>
            Guesty calendar feeds can sync unavailable dates now. A richer
            Guesty channel/API connection is planned after partner approval.
          </p>
          <details className={styles.guide}>
            <summary>Use Guesty iCal now</summary>
            <ol>
              <li>Open the listing calendar in Guesty and copy its iCal export link.</li>
              <li>Choose Guesty in the iCal provider list below.</li>
              <li>Paste the private feed URL and run the compatibility test.</li>
            </ol>
          </details>
          <div className={styles.actions}>
            <a className="button button-small button-quiet" href="#ical-connections">
              Connect Guesty iCal
            </a>
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <strong>Hostify</strong>
              <span>Direct PMS API + webhooks</span>
            </div>
            <span className={`${styles.badge} ${styles.coming}`}>Coming soon</span>
          </div>
          <p>
            Planned direct integration for availability and reservation
            synchronization. No Hostify credentials are needed yet.
          </p>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <strong>Firefly Reservations</strong>
              <span>Channel integration</span>
            </div>
            <span className={`${styles.badge} ${styles.coming}`}>Coming soon</span>
          </div>
          <p>
            Planned through the Channex channel path, pending channel access,
            property mapping and production certification.
          </p>
        </article>
      </div>
    </section>
  );
}
