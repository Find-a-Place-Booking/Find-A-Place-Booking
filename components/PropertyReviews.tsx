import type { PublishedReview } from "@/lib/public/listings";

import { StarRating } from "./StarRating";
import styles from "./PropertyReviews.module.css";

export function PropertyReviews({
  rating,
  reviewCount,
  reviews,
}: {
  rating: number;
  reviewCount: number;
  reviews: PublishedReview[];
}) {
  if (!reviews.length) {
    return (
      <div className={styles.wrap}>
        <h3>Guest reviews</h3>
        <p className={styles.empty}>
          No verified guest reviews yet.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <strong>
          {rating.toFixed(1)} from {reviewCount} verified review
          {reviewCount === 1 ? "" : "s"}
        </strong>
        <StarRating rating={rating} />
      </div>

      <div className={styles.grid}>
        {reviews.map((review) => (
          <article className={styles.card} key={review.id}>
            <div className={styles.top}>
              <div className={styles.identity}>
                <strong>{review.guestName}</strong>
                <StarRating rating={review.rating} showValue />
              </div>
              <span className={styles.date}>
                {new Date(review.createdAt).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  },
                )}
              </span>
            </div>

            <p className={styles.body}>{review.body}</p>

            {review.hostResponse ? (
              <div className={styles.response}>
                <strong>Host response</strong>
                <span>{review.hostResponse}</span>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
