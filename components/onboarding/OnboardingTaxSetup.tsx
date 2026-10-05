"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getStateTaxSetup } from "@/lib/taxes/state-config";
import styles from "./OnboardingTaxSetup.module.css";

type TaxLine = {
  key: string;
  category: "LOCAL_SALES" | "LOCAL_LODGING" | "OTHER";
  label: string;
  rate_bps: number;
  ratePercentText: string;
  base_scope: "LODGING_ONLY" | "ACCOMMODATION_TOTAL" | "PRE_TAX_TOTAL";
};

function rateText(rateBps: number) {
  const value = Number(rateBps || 0) / 100;
  if (!value) return "";
  return value.toFixed(rateBps % 100 ? 2 : 0);
}

function defaultsFor(stateCode: string): TaxLine[] {
  return getStateTaxSetup(stateCode).suggestedLines.map((line, index) => ({
    key: `suggested-${stateCode}-${index}`,
    category: line.category,
    label: line.label,
    rate_bps: 0,
    ratePercentText: "",
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
      .map((line, index) => {
        const rateBps = Number.isFinite(Number(line?.rate_bps))
          ? Math.max(0, Math.min(10000, Number(line.rate_bps)))
          : 0;

        return {
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
          rate_bps: rateBps,
          ratePercentText: rateText(rateBps),
          base_scope: [
            "LODGING_ONLY",
            "ACCOMMODATION_TOTAL",
            "PRE_TAX_TOTAL",
          ].includes(line?.base_scope)
            ? line.base_scope
            : "ACCOMMODATION_TOTAL",
        };
      }) as TaxLine[];

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
  }, [city, locality, onLocalityChange, onAcceptedChange]);

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

  function patchRate(index: number, value: string) {
    const cleaned = value
      .replace(/[^\d.]/g, "")
      .replace(/^(\d*\.?\d*).*$/, "$1");

    if (cleaned) {
      const parsed = Number.parseFloat(cleaned);
      if (Number.isFinite(parsed) && parsed > 100) return;
    }

    patch(index, {
      ratePercentText: cleaned,
      rate_bps: cleaned && Number.isFinite(Number.parseFloat(cleaned))
        ? Math.round(Number.parseFloat(cleaned) * 100)
        : 0,
    });
  }

  function addLine() {
    if (lines.length >= 12) return;
    commit([
      ...lines,
      {
        key: `new-${Date.now()}-${lines.length}`,
        category: "LOCAL_SALES",
        label: "",
        rate_bps: 0,
        ratePercentText: "",
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
        <span>{config.name} property · optional checkout tax setup</span>
        <strong>Set this up only if you want Find A Place to add tax at checkout.</strong>
        <p>
          {config.intro} If you skip this step, Find A Place adds $0 tax to
          checkout and you remain responsible for calculating, filing and
          remitting any taxes that apply to the property.
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
            <span>
              Statewide taxes are automatic. Add only the remaining local rate
              or rates for this property.
            </span>
          </div>
          <button
            className={styles.addButton}
            type="button"
            onClick={addLine}
            disabled={lines.length >= 12}
          >
            + Add local tax
          </button>
        </div>

        <div className={styles.lines}>
          {lines.length ? (
            lines.map((line, index) => (
              <div className={styles.line} key={line.key}>
                <label>
                  <span>Local tax type</span>
                  <select
                    value={line.category}
                    onChange={(event) =>
                      patch(index, {
                        category: event.target
                          .value as TaxLine["category"],
                      })
                    }
                  >
                    <option value="LOCAL_SALES">Local sales tax</option>
                    <option value="LOCAL_LODGING">
                      Local lodging / occupancy / A&amp;P
                    </option>
                    <option value="OTHER">Other local tax</option>
                  </select>
                </label>

                <label>
                  <span>Tax name</span>
                  <input
                    value={line.label}
                    onChange={(event) =>
                      patch(index, { label: event.target.value })
                    }
                    placeholder="Example: City + county sales tax"
                    maxLength={160}
                  />
                </label>

                <label>
                  <span>Local rate</span>
                  <div className={styles.rateWrap}>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={line.ratePercentText}
                      onChange={(event) => patchRate(index, event.target.value)}
                      placeholder="3"
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
              No local tax lines added. Use <strong>+ Add local tax</strong> if
              a local tax applies to this property.
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
          Use this tax setup at checkout. I confirm that it is accurate for
          this property and understand that guest tax funds remain in my
          connected payment account and that I am responsible for filing and
          remittance obligations.
        </span>
      </label>
    </div>
  );
}
