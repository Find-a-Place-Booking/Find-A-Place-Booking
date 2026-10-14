import { TrackedLink } from "@/components/TrackedLink";
import styles from "./InsuranceResourceNote.module.css";

type Provider = "faye" | "proper";
type Placement = "checkout" | "booking_confirmed" | "my_trip" | "host_help";

const RESOURCES = {
  faye: {
    label: "Travel insurance (Faye)",
    description:
      "Want to explore trip protection? Faye offers travel insurance options you can review separately.",
    action: "Explore travel coverage ↗",
    audience: "guest",
  },
  proper: {
    label: "Short-term rental insurance (Proper)",
    description:
      "Hosting a rental? Proper offers insurance designed for short-term rental property owners.",
    action: "Explore host coverage ↗",
    audience: "host",
  },
} as const;

/** Optional information only. No selection, purchase, or billing is part of checkout. */
export function InsuranceResourceNote({
  provider,
  placement,
}: {
  provider: Provider;
  placement: Placement;
}) {
  const resource = RESOURCES[provider];

  return (
    <aside className={styles.note} aria-label={resource.label}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>Optional third-party resource</span>
        <strong>{resource.label}</strong>
        <p>{resource.description}</p>
        <small>
          Insurance is not included with Find A Place bookings or hosting. Coverage,
          eligibility, prices and claims are handled by the outside provider.
        </small>
      </div>
      <TrackedLink
        className={styles.link}
        href={`/go/insurance/${provider}?source=${placement}`}
        target="_blank"
        rel="noopener noreferrer"
        prefetch={false}
        eventName="insurance_resource_click"
        eventData={{ provider, audience: resource.audience, placement }}
      >
        {resource.action}
      </TrackedLink>
    </aside>
  );
}
