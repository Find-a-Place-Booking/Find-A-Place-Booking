import { createAdminClient } from "@/lib/supabase/admin";
import { StarRating } from "@/components/StarRating";
import { PublicHostReviewForm } from "@/components/PublicHostReviewForm";
import styles from "./PublicHostReviews.module.css";

export async function PublicHostCommunityReviews({ organizationId, hostSlug, hostName }: {
  organizationId: string;
  hostSlug: string;
  hostName: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("public_host_reviews")
    .select("id,reviewer_name,rating,body,experience_type,created_at")
    .eq("organization_id", organizationId)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) console.error("[host reviews] unable to load published community feedback", { code: error.code });
  const published = error ? [] : (data ?? []);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
  return (
    <section className={`shell ${styles.wrap}`} id="community-host-reviews">
      <div className={styles.head}>
        <div>
          <p className="eyebrow dark">Community experiences</p>
          <h2>Other feedback about {hostName}</h2>
        </div>
      </div>
      <p className={styles.note}>
        These are experiences shared directly by community members, including guests who booked elsewhere.
        They are reviewed by Find A Place but have <strong>not been verified against a Find A Place reservation.</strong>
        They do not change the verified-stay rating shown above.
      </p>
      {published.length ? (
        <div className={styles.grid}>
          {published.map((item) => (
            <article className={styles.card} key={item.id}>
              <div className={styles.cardTop}>
                <div>
                  <strong>{item.reviewer_name}</strong>
                  <StarRating rating={Number(item.rating)} showValue />
                </div>
                <small>{new Date(item.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</small>
              </div>
              <p>{item.body}</p>
              <span className={styles.label}>
                {item.experience_type === "STAYED" ? "Reported stay · not booking-verified" :
                  item.experience_type === "HOST_INTERACTION" ? "Host communication · not booking-verified" :
                  "Community experience · not booking-verified"}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.note}>No community reviews have been approved yet.</p>
      )}
      {siteKey ? (
        <PublicHostReviewForm hostSlug={hostSlug} hostName={hostName} siteKey={siteKey} />
      ) : (
        <p className={styles.note}>Review submission is temporarily unavailable. Please contact Find A Place.</p>
      )}
    </section>
  );
}
