import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./PublicNearbyExperiences.module.css";

type PublicNearbyExperience = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  distance_miles: number | string | null;
  drive_minutes: number | null;
  website_url: string | null;
  image_path: string | null;
  sort_order: number;
};

function validExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function distanceLabel(row: PublicNearbyExperience) {
  const miles = Number(row.distance_miles);
  const parts: string[] = [];
  if (Number.isFinite(miles)) {
    parts.push(`${miles % 1 === 0 ? miles.toFixed(0) : miles.toFixed(1)} mi`);
  }
  if (typeof row.drive_minutes === "number" && row.drive_minutes > 0) {
    parts.push(`about ${row.drive_minutes} min drive`);
  }
  return parts.join(" · ");
}

export async function PublicNearbyExperiences({
  propertyId,
}: {
  propertyId: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("property_nearby_experiences")
    .select(
      "id,title,category,description,distance_miles,drive_minutes,website_url,image_path,sort_order",
    )
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(12);

  if (error) {
    // Keep the public listing healthy if nearby content is temporarily unavailable.
    console.error("[public nearby experiences] unavailable", {
      propertyId,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as PublicNearbyExperience[];
  if (!rows.length) return null;

  const imageUrls = new Map<string, string>();
  await Promise.all(
    rows.map(async (row) => {
      if (!row.image_path) return;
      const { data: signed, error: signedError } = await admin.storage
        .from("property-images")
        .createSignedUrl(row.image_path, 3600, {
          transform: {
            width: 720,
            height: 480,
            resize: "cover",
            quality: 76,
          },
        });

      if (signed?.signedUrl && !signedError) {
        imageUrls.set(row.id, signed.signedUrl);
        return;
      }

      const { data: original } = await admin.storage
        .from("property-images")
        .createSignedUrl(row.image_path, 3600);
      if (original?.signedUrl) imageUrls.set(row.id, original.signedUrl);
    }),
  );

  const firstRows = rows.slice(0, 4);
  const remainingRows = rows.slice(4);

  const renderCard = (row: PublicNearbyExperience) => {
    const image = imageUrls.get(row.id);
    const website = validExternalUrl(row.website_url);
    const distance = distanceLabel(row);

    return (
      <article
        className={`${styles.card} ${image ? "" : styles.cardNoImage}`}
        key={row.id}
      >
        {image ? (
          <div className={styles.media}>
            <img src={image} alt="" loading="lazy" decoding="async" />
            <span>{row.category}</span>
          </div>
        ) : (
          <div className={styles.noImage}>
            <span>{row.category}</span>
            <strong>{row.title.slice(0, 1).toUpperCase()}</strong>
          </div>
        )}

        <div className={styles.copy}>
          <div>
            <h3>{row.title}</h3>
            {distance ? <strong>{distance}</strong> : null}
          </div>

          {row.description ? <p>{row.description}</p> : null}

          {website ? (
            <a href={website} target="_blank" rel="noreferrer">
              More information ↗
            </a>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <section className={styles.section} id="nearby-experiences">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Near this stay</p>
          <h2>Things worth doing nearby</h2>
          <p>
            Local favorites and trip draws picked by the host, so you can see
            what is around the stay before you book.
          </p>
        </div>
        <span className={styles.count}>
          {rows.length} place{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className={styles.grid}>{firstRows.map(renderCard)}</div>

      {remainingRows.length ? (
        <details className={styles.more}>
          <summary>
            See all {rows.length} nearby experiences
            <span aria-hidden="true">＋</span>
          </summary>
          <div className={`${styles.grid} ${styles.moreGrid}`}>
            {remainingRows.map(renderCard)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
