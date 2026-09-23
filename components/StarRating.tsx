import styles from "./StarRating.module.css";

export function StarRating({
  rating,
  showValue = false,
}: {
  rating: number;
  showValue?: boolean;
}) {
  const normalized = Math.max(0, Math.min(5, Number(rating || 0)));
  const rounded = Math.round(normalized);

  return (
    <span
      className={styles.rating}
      aria-label={`${normalized.toFixed(1)} out of 5 stars`}
    >
      <span className={styles.stars} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            className={`${styles.star} ${
              index < rounded ? "" : styles.empty
            }`}
            key={index}
          >
            ★
          </span>
        ))}
      </span>
      {showValue ? (
        <span className={styles.value}>{normalized.toFixed(1)}/5</span>
      ) : null}
    </span>
  );
}
