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
    // Keep the public listing healthy if the migration has not been applied yet
    // or nearby content is temporarily unavailable.
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
            width: 900,
            height: 600,
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

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <p className="eyebrow dark">Near this stay</p>
        <h2>Things worth doing nearby</h2>
        <p>
          Local favorites and trip draws picked by the host to help you see what
          is around this stay.
        </p>
      </div>

      <div className={styles.grid}>
        {rows.map((row) => {
          const image = imageUrls.get(row.id);
          const website = validExternalUrl(row.website_url);
          const distance = distanceLabel(row);

          return (
            <article
              className={`${styles.card} ${
                image ? "" : styles.cardNoImage
              }`}
              key={row.id}
            >
              {image ? (
                <div className={styles.media}>
                  <img src={image} alt="" loading="lazy" decoding="async" />
                  <span>{row.category}</span>
                </div>
              ) : null}

              <div className={styles.copy}>
                {!image ? (
                  <span className={styles.categoryInline}>
                    {row.category}
                  </span>
                ) : null}

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
        })}
      </div>
    </section>
  );
}
