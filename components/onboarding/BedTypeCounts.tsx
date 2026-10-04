"use client";

import styles from "./BedTypeCounts.module.css";

type BedEntry = {
  type: string;
  count: number;
};

const bedTypes = [
  "King",
  "Queen",
  "Full / double",
  "Twin / single",
  "Bunk bed",
  "Sofa bed",
  "Futon",
  "Murphy bed",
  "Crib",
] as const;

function parse(value: string): BedEntry[] {
  if (!value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry) => {
      const type = String(entry?.type || "").trim();
      const count = Number(entry?.count || 0);
      if (!bedTypes.includes(type as (typeof bedTypes)[number])) return [];
      if (!Number.isInteger(count) || count < 1 || count > 20) return [];
      return [{ type, count }];
    });
  } catch {
    return [];
  }
}

function total(entries: BedEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

export function BedTypeCounts({
  value,
  legacyTotal = 0,
  onChange,
}: {
  value: string;
  legacyTotal?: number;
  onChange: (next: { json: string; total: number }) => void;
}) {
  const entries = parse(value);
  const counts = new Map(entries.map((entry) => [entry.type, entry.count]));
  const configuredTotal = total(entries);

  function setCount(type: string, rawCount: number) {
    const safeCount = Math.max(0, Math.min(20, Math.trunc(rawCount || 0)));
    const next = new Map(counts);

    if (safeCount > 0) next.set(type, safeCount);
    else next.delete(type);

    const normalized = bedTypes.flatMap((bedType) => {
      const count = next.get(bedType) ?? 0;
      return count > 0 ? [{ type: bedType, count }] : [];
    });

    onChange({
      json: JSON.stringify(normalized),
      total: total(normalized),
    });
  }

  return (
    <section className={styles.wrap} aria-labelledby="bed-type-heading">
      <div className={styles.heading}>
        <div>
          <strong id="bed-type-heading">Bed types & quantities</strong>
          <span>
            Add how many of each bed this property actually has. Example: 2
            queens + 2 twins.
          </span>
        </div>
        <b>
          {configuredTotal || legacyTotal || 0} total bed
          {(configuredTotal || legacyTotal || 0) === 1 ? "" : "s"}
        </b>
      </div>

      {legacyTotal > 0 && !entries.length ? (
        <p className={styles.legacyNote}>
          This listing currently has {legacyTotal} total bed
          {legacyTotal === 1 ? "" : "s"}. Add the types below to make the
          sleeping setup more specific.
        </p>
      ) : null}

      <div className={styles.grid}>
        {bedTypes.map((type) => {
          const count = counts.get(type) ?? 0;
          return (
            <label className={count > 0 ? styles.selected : ""} key={type}>
              <span>{type}</span>
              <div className={styles.counter}>
                <button
                  type="button"
                  onClick={() => setCount(type, count - 1)}
                  disabled={count <= 0}
                  aria-label={`Remove one ${type}`}
                >
                  −
                </button>
                <input
                  aria-label={`${type} quantity`}
                  type="number"
                  min="0"
                  max="20"
                  inputMode="numeric"
                  value={count || ""}
                  placeholder="0"
                  onChange={(event) =>
                    setCount(type, Number.parseInt(event.target.value || "0", 10))
                  }
                />
                <button
                  type="button"
                  onClick={() => setCount(type, count + 1)}
                  disabled={count >= 20}
                  aria-label={`Add one ${type}`}
                >
                  +
                </button>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}
