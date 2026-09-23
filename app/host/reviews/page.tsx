import Link from "next/link";

import { saveHostReviewResponse } from "@/app/host/reviews/actions";
import { DashboardShell } from "@/components/DashboardShell";
import { StarRating } from "@/components/StarRating";
import { getHostReviews } from "@/lib/host/reviews";

import styles from "./reviews.module.css";

export default async function HostReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [query, reviews] = await Promise.all([
    searchParams,
    getHostReviews(),
  ]);

  const published = reviews.filter(
    (review) => review.status === "PUBLISHED",
  );
  const average = published.length
    ? published.reduce((sum, review) => sum + review.rating, 0) /
      published.length
    : 0;
  const awaitingResponse = published.filter(
    (review) => !review.hostResponse,
  ).length;

  return (
    <DashboardShell active="Reviews" title="Guest reviews">
      <div className="dash-toolbar">
        <div>
          <p>
            Reviews come from completed Find A Place stays. Guests leave a
            written review and a 1–5 star rating, and you can post a public
            response.
          </p>
        </div>
      </div>

      {query.saved ? (
        <div className="admin-message success">
          <strong>Response saved.</strong> It is now shown with the guest
          review on the public listing.
        </div>
      ) : null}

      {query.error ? (
        <div className="admin-message error">{query.error}</div>
      ) : null}

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span>Average rating</span>
          <strong>
            {published.length ? average.toFixed(1) : "—"}
          </strong>
          <small>
            {published.length
              ? `${published.length} verified review${
                  published.length === 1 ? "" : "s"
                }`
              : "No guest reviews yet"}
          </small>
        </div>

        <div className={styles.metric}>
          <span>Published reviews</span>
          <strong>{published.length}</strong>
          <small>Verified completed stays</small>
        </div>

        <div className={styles.metric}>
          <span>Awaiting response</span>
          <strong>{awaitingResponse}</strong>
          <small>Optional host responses</small>
        </div>
      </div>

      {reviews.length ? (
        <div className={styles.list}>
          {reviews.map((review) => (
            <article className={styles.card} key={review.id}>
              <div className={styles.top}>
                <div className={styles.identity}>
                  <h2>{review.propertyName}</h2>
                  <StarRating rating={review.rating} showValue />
                  <Link href={`/stays/${review.slug}`}>
                    View public listing →
                  </Link>
                </div>

                <div className={styles.meta}>
                  <strong>{review.guestName}</strong>
                  <span>
                    {new Date(review.createdAt).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                  </span>
                  <span>{review.status}</span>
                </div>
              </div>

              <p className={styles.body}>{review.body}</p>

              {review.hostResponse ? (
                <div className={styles.currentResponse}>
                  <strong>Your public response</strong>
                  {"\n"}
                  {review.hostResponse}
                </div>
              ) : null}

              {review.status === "PUBLISHED" ? (
                <form
                  className={styles.response}
                  action={saveHostReviewResponse}
                >
                  <input
                    type="hidden"
                    name="reviewId"
                    value={review.id}
                  />
                  <input
                    type="hidden"
                    name="slug"
                    value={review.slug}
                  />

                  <label>
                    <span>
                      {review.hostResponse
                        ? "Update your response"
                        : "Respond publicly"}
                    </span>
                    <textarea
                      name="response"
                      maxLength={4000}
                      defaultValue={review.hostResponse || ""}
                      placeholder="Thank the guest or respond to something they mentioned."
                      required
                    />
                  </label>

                  <div className={styles.responseActions}>
                    <small>
                      Your response appears directly under this verified
                      review.
                    </small>
                    <button
                      className="button button-small"
                      type="submit"
                    >
                      {review.hostResponse
                        ? "Update response"
                        : "Post response"}
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <section className={`panel ${styles.empty}`}>
          <strong>No guest reviews yet.</strong>
          <p className="muted">
            After a confirmed stay checks out, the guest can leave a written
            review and 1–5 star rating from My Trip.
          </p>
        </section>
      )}
    </DashboardShell>
  );
}
