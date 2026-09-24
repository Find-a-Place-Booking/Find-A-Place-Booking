"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getStateTaxSetup } from "@/lib/taxes/state-config";
import styles from "./OnboardingTaxSetup.module.css";

type TaxLine = {
  key: string;
  category: "LOCAL_SALES" | "LOCAL_LODGING" | "OTHER";
  label: string;
  rate_bps: number;
  base_scope: "LODGING_ONLY" | "ACCOMMODATION_TOTAL" | "PRE_TAX_TOTAL";
};

function defaultsFor(stateCode: string): TaxLine[] {
  return getStateTaxSetup(stateCode).suggestedLines.map((line, index) => ({
    key: `suggested-${stateCode}-${index}`,
    category: line.category,
    label: line.label,
    rate_bps: 0,
    base_scope: line.baseScope,
  }));
}

function parseLines(raw: string, stateCode: string): TaxLine[] {
  if (!raw.trim()) return defaultsFor(stateCode);

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultsFor(stateCode);

    const lines = parsed
      .slice(0, 12)
      .map((line, index) => ({
        key:
          typeof line?.key === "string"
            ? line.key
            : `saved-${stateCode}-${index}`,
        category: ["LOCAL_SALES", "LOCAL_LODGING", "OTHER"].includes(
          line?.category,
        )
          ? line.category
          : "OTHER",
        label: typeof line?.label === "string" ? line.label : "",
        rate_bps: Number.isFinite(Number(line?.rate_bps))
          ? Math.max(0, Math.min(10000, Number(line.rate_bps)))
          : 0,
        base_scope: [
          "LODGING_ONLY",
          "ACCOMMODATION_TOTAL",
          "PRE_TAX_TOTAL",
        ].includes(line?.base_scope)
          ? line.base_scope
          : "ACCOMMODATION_TOTAL",
      })) as TaxLine[];

    return lines.length ? lines : defaultsFor(stateCode);
  } catch {
    return defaultsFor(stateCode);
  }
}

function serialize(lines: TaxLine[]) {
  return JSON.stringify(
    lines.map(({ category, label, rate_bps, base_scope }) => ({
      category,
      label,
      rate_bps,
      base_scope,
    })),
  );
}

function rateText(rateBps: number) {
  return (Number(rateBps || 0) / 100).toFixed(
    rateBps % 100 ? 2 : 0,
  );
}

export function OnboardingTaxSetup({
  stateCode,
  city,
  county,
  locality,
  linesJson,
  accepted,
  onCountyChange,
  onLocalityChange,
  onLinesChange,
  onAcceptedChange,
}: {
  stateCode: string;
  city: string;
  county: string;
  locality: string;
  linesJson: string;
  accepted: boolean;
  onCountyChange: (value: string) => void;
  onLocalityChange: (value: string) => void;
  onLinesChange: (value: string) => void;
  onAcceptedChange: (value: boolean) => void;
}) {
  const normalizedState = (stateCode || "").trim().toUpperCase();
  const config = useMemo(
    () => getStateTaxSetup(normalizedState),
    [normalizedState],
  );
  const previousState = useRef(normalizedState);
  const [lines, setLines] = useState<TaxLine[]>(() =>
    parseLines(linesJson, normalizedState),
  );

  useEffect(() => {
    if (!locality.trim() && city.trim()) {
      onLocalityChange(city.trim());
      onAcceptedChange(false);
    }
  }, [city, locality, onLocalityChange]);

  useEffect(() => {
    if (previousState.current === normalizedState) return;

    previousState.current = normalizedState;
    const next = defaultsFor(normalizedState);
    setLines(next);
    onLinesChange(serialize(next));
    onAcceptedChange(false);
  }, [normalizedState, onAcceptedChange, onLinesChange]);

  function commit(next: TaxLine[]) {
    setLines(next);
    onLinesChange(serialize(next));
    onAcceptedChange(false);
  }

  function patch(index: number, patchValue: Partial<TaxLine>) {
    commit(
      lines.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, ...patchValue }
          : line,
      ),
    );
  }

  function addLine() {
    if (lines.length >= 12) return;
    commit([
      ...lines,
      {
        key: `new-${Date.now()}-${lines.length}`,
        category: "OTHER",
        label: "",
        rate_bps: 0,
        base_scope: "ACCOMMODATION_TOTAL",
      },
    ]);
  }

  function removeLine(index: number) {
    commit(lines.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <div className={styles.taxStep}>
      <div className={styles.stateCard}>
        <span>{config.name} property</span>
        <strong>Statewide rules are handled automatically.</strong>
        <p>
          {config.intro} You only need to enter the local taxes that
          apply to this specific property.
        </p>
      </div>

      {config.reviewNote ? (
        <div className={styles.reviewNote}>{config.reviewNote}</div>
      ) : null}

      <div className={styles.locationGrid}>
        <label>
          <span>County</span>
          <input
            value={county}
            onChange={(event) => {
              onCountyChange(event.target.value);
              onAcceptedChange(false);
            }}
            placeholder="County"
          />
        </label>
        <label>
          <span>Tax locality / city</span>
          <input
            value={locality}
            onChange={(event) => {
              onLocalityChange(event.target.value);
              onAcceptedChange(false);
            }}
            placeholder={city || "City"}
          />
        </label>
      </div>

      <div className={styles.lineSection}>
        <div className={styles.lineHeader}>
          <div>
            <strong>Local taxes</strong>
            <span>{config.localHelp}</span>
          </div>
          <button
            className={styles.addButton}
            type="button"
            onClick={addLine}
            disabled={lines.length >= 12}
          >
            + Add tax
          </button>
        </div>

        <div className={styles.lines}>
          {lines.length ? (
            lines.map((line, index) => (
              <div className={styles.line} key={line.key}>
                <label>
                  <span>Type</span>
                  <select
                    value={line.category}
                    onChange={(event) =>
                      patch(index, {
                        category: event.target
                          .value as TaxLine["category"],
                      })
                    }
                  >
                    <option value="LOCAL_SALES">Sales tax</option>
                    <option value="LOCAL_LODGING">
                      Lodging / occupancy
                    </option>
                    <option value="OTHER">Other tax</option>
                  </select>
                </label>

                <label>
                  <span>Tax name</span>
                  <input
                    value={line.label}
                    onChange={(event) =>
                      patch(index, { label: event.target.value })
                    }
                    placeholder="Local lodging tax"
                    maxLength={160}
                  />
                </label>

                <label>
                  <span>Rate</span>
                  <div className={styles.rateWrap}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.001"
                      inputMode="decimal"
                      value={rateText(line.rate_bps)}
                      onChange={(event) => {
                        const parsed = Number.parseFloat(
                          event.target.value,
                        );
                        patch(index, {
                          rate_bps: Number.isFinite(parsed)
                            ? Math.round(parsed * 100)
                            : 0,
                        });
                      }}
                    />
                    <b>%</b>
                  </div>
                </label>

                <label>
                  <span>Applies to</span>
                  <select
                    value={line.base_scope}
                    onChange={(event) =>
                      patch(index, {
                        base_scope: event.target
                          .value as TaxLine["base_scope"],
                      })
                    }
                  >
                    <option value="ACCOMMODATION_TOTAL">
                      Lodging + required stay fees
                    </option>
                    <option value="LODGING_ONLY">
                      Lodging only
                    </option>
                    <option value="PRE_TAX_TOTAL">
                      All pre-tax charges
                    </option>
                  </select>
                </label>

                <button
                  className={styles.removeButton}
                  type="button"
                  onClick={() => removeLine(index)}
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div className={styles.empty}>
              No local tax lines added. Add one only when a local tax
              applies to this property.
            </div>
          )}
        </div>
      </div>

      <label className={styles.certification}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) =>
            onAcceptedChange(event.target.checked)
          }
        />
        <span>
          I confirm that this tax setup is accurate for this property.
          I understand that guest tax funds remain in my connected
          payment account and that I am responsible for the applicable
          filing and remittance obligations.
        </span>
      </label>
    </div>
  );
}
