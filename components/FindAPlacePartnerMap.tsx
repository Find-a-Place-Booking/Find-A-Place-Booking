import styles from "@/app/about/about-map.module.css";

const PARTNER_MAP_ID = "1znr--DZK2UInog1toBsweyTKqHtFPnU";
const PARTNER_MAP_URL = `https://www.google.com/maps/d/u/0/viewer?mid=${PARTNER_MAP_ID}`;

export function FindAPlacePartnerMap({
  eyebrow = "Across the Find A Place network",
  title = "See where our partners are.",
  description = "Explore the places and partners behind Find A Place, from local stays to outdoor destinations across Arkansas.",
}: {
  eyebrow?: string | null;
  title?: string;
  description?: string | null;
}) {
  const displayEyebrow = eyebrow ?? "Across the Find A Place network";
  const displayDescription =
    description ??
    "Explore the places and partners behind Find A Place, from local stays to outdoor destinations across Arkansas.";

  return (
    <section className={styles.partnerMapSection} aria-labelledby="find-a-place-partner-map-title">
      <div className="shell">
        <div className={styles.partnerMapHeading}>
          <div>
            <p className="eyebrow dark">{displayEyebrow}</p>
            <h2 id="find-a-place-partner-map-title">{title}</h2>
          </div>
          <p>{displayDescription}</p>
        </div>
        <div className={styles.partnerMapFrame}>
          <iframe
            title="Find A Place partner locations"
            src={`https://www.google.com/maps/d/u/0/embed?mid=${PARTNER_MAP_ID}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <div className={styles.partnerMapFooter}>
          <span>Partner locations are maintained by Find A Place in Google My Maps.</span>
          <a href={PARTNER_MAP_URL} target="_blank" rel="noopener noreferrer">
            Open full partner map →
          </a>
        </div>
      </div>
    </section>
  );
}
