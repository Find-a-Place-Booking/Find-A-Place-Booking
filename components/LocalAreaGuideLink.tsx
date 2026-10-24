import { TrackedLink } from "@/components/TrackedLink";
import styles from "./LocalAreaGuideLink.module.css";

type Placement = "stay" | "trip";

type Guide = {
  id: string;
  label: string;
  url: string;
};

// City-level mapping only. Public-area descriptions can mention places far from
// the actual property and must not be used to guess where a guest is staying.
const guides: Record<string, Guide> = {
  "glenwood": { id: "glenwood", label: "Glenwood", url: "https://www.glenwoodarkansas.org" },
  "caddo gap": { id: "glenwood", label: "Glenwood & Caddo River", url: "https://www.glenwoodarkansas.org" },
  "hot springs": { id: "hot-springs", label: "Hot Springs", url: "https://www.hotspringsarkansas.org" },
  "bismarck": { id: "hot-springs", label: "Hot Springs & DeGray Lake", url: "https://www.hotspringsarkansas.org" },
  "mountain pine": { id: "hot-springs", label: "Hot Springs", url: "https://www.hotspringsarkansas.org" },
  "pearcy": { id: "hot-springs", label: "Hot Springs", url: "https://www.hotspringsarkansas.org" },
  "royal": { id: "hot-springs", label: "Hot Springs", url: "https://www.hotspringsarkansas.org" },
  "mount ida": { id: "mount-ida", label: "Mount Ida", url: "https://www.mountidaarkansas.org" },
  "norman": { id: "mount-ida", label: "Mount Ida", url: "https://www.mountidaarkansas.org" },
  "story": { id: "mount-ida", label: "Mount Ida", url: "https://www.mountidaarkansas.org" },
  "pencil bluff": { id: "mount-ida", label: "Mount Ida", url: "https://www.mountidaarkansas.org" },
  "murfreesboro": { id: "murfreesboro", label: "Murfreesboro", url: "https://www.murfreesboroarkansas.org" },
  "daisy": { id: "murfreesboro", label: "Murfreesboro & Lake Greeson", url: "https://www.murfreesboroarkansas.org" },
  "kirby": { id: "murfreesboro", label: "Murfreesboro & Lake Greeson", url: "https://www.murfreesboroarkansas.org" },
  "amity": { id: "amity", label: "Amity", url: "https://www.amityarkansas.org" },
};

export function LocalAreaGuideLink({
  city,
  state,
  placement,
}: {
  city?: string | null;
  state?: string | null;
  placement: Placement;
}) {
  if (state?.trim().toUpperCase() !== "AR") return null;

  const guide = guides[(city ?? "").trim().toLowerCase().replace(/\s+/g, " ")];
  if (!guide) return null;

  const href = guide.url;
  const link = (
    <TrackedLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
      eventName="local_tourism_guide_click"
      eventData={{ guide: guide.id, placement }}
      className={styles.link}
    >
      {placement === "trip" ? `Explore ${guide.label} ↗` : "Open local guide ↗"}
    </TrackedLink>
  );

  if (placement === "trip") {
    return (
      <div className={`${styles.row} ${styles.trip}`}>
        <span className={styles.title}>Planning your visit?</span>
        {link}
        <span className={styles.attribution}>Local guide by Natural State Tourism Project</span>
      </div>
    );
  }

  return (
    <div className={`${styles.row} ${styles.stay}`}>
      <div className={styles.copy}>
        <span className={styles.title}>Explore the {guide.label} area</span>
        <span className={styles.detail}>Restaurants, things to do and local events</span>
        <span className={styles.attribution}>Local guide by Natural State Tourism Project</span>
      </div>
      {link}
    </div>
  );
}
