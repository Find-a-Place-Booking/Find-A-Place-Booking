"use client";

import { useMemo, useState } from "react";

import { getStateTaxSetup } from "@/lib/taxes/state-config";

import styles from "./PropertyTaxLineFields.module.css";

export type PropertyTaxLineInput = {
  id?: string;
  category: "LOCAL_SALES" | "LOCAL_LODGING" | "OTHER";
  label: string;
  rate_bps: number;
  base_scope: "LODGING_ONLY" | "ACCOMMODATION_TOTAL" | "PRE_TAX_TOTAL";
};

type EditorLine = PropertyTaxLineInput & {
  key: string;
  ratePercentText: string;
};

function rateText(rateBps: number) {
  const value = Number(rateBps || 0) / 100;
  if (!value) return "";
  return value.toFixed(rateBps % 100 ? 2 : 0);
}

function makeInitialLines(
  stateCode: string,
  initialLines: PropertyTaxLineInput[],
): EditorLine[] {
  if (initialLines.length) {
    return initialLines.map((line, index) => ({
      ...line,
      key: line.id || `existing-${index}`,
      ratePercentText: rateText(line.rate_bps),
    }));
  }

  const config = getStateTaxSetup(stateCode);
  return config.suggestedLines.map((line, index) => ({
    key: `suggested-${index}`,
    category: line.category,
    label: line.label,
    rate_bps: 0,
    ratePercentText: "",
    base_scope: line.baseScope,
  }));
}

export function PropertyTaxLineFields({
  stateCode,
  initialLines,
}: {
  stateCode: string;
  initialLines: PropertyTaxLineInput[];
}) {
  const config = useMemo(() => getStateTaxSetup(stateCode), [stateCode]);
  const [lines, setLines] = useState<EditorLine[]>(() =>
    makeInitialLines(stateCode, initialLines),
  );

  function patchLine(index: number, patch: Partial<EditorLine>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
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

    patchLine(index, {
      ratePercentText: cleaned,
      rate_bps: cleaned && Number.isFinite(Number.parseFloat(cleaned))
        ? Math.round(Number.parseFloat(cleaned) * 100)
        : 0,
    });
  }

  function addLine() {
    setLines((current) => {
      if (current.length >= 12) return current;
      return [
        ...current,
        {
          key: `new-${Date.now()}-${current.length}`,
          category: "LOCAL_SALES",
          label: "",
          rate_bps: 0,
          ratePercentText: "",
          base_scope: "ACCOMMODATION_TOTAL",
        },
      ];
    });
  }

  function removeLine(index: number) {
    setLines((current) =>
      current.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.heading}>
        <div>
          <strong>Local taxes for this property</strong>
          <span>{config.localHelp}</span>
          <span>
            Statewide taxes shown above are automatic. Add only the local rate
            or rates that still need to be charged for this property.
          </span>
        </div>
        <button type="button" onClick={addLine} disabled={lines.length >= 12}>
          + Add local tax
        </button>
      </div>

      <div className={styles.lines}>
        {lines.map((line, index) => (
          <div className={styles.line} key={line.key}>
            <label className={styles.typeField}>
              <span>Local tax type</span>
              <select
                name="taxLineCategory"
                value={line.category}
                onChange={(event) =>
                  patchLine(index, {
                    category: event.target.value as EditorLine["category"],
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

            <label className={styles.nameField}>
              <span>Tax name</span>
              <input
                name="taxLineLabel"
                value={line.label}
                onChange={(event) =>
                  patchLine(index, { label: event.target.value })
                }
                placeholder="Example: City + county sales tax"
                maxLength={160}
              />
            </label>

            <label className={styles.rateField}>
              <span>Local rate</span>
              <div className={styles.rateInput}>
                <input
                  name="taxLineRatePercent"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={line.ratePercentText}
                  onChange={(event) => patchRate(index, event.target.value)}
                  placeholder="3"
                  aria-label={`${line.label || "Local tax"} rate percent`}
                />
                <b>%</b>
              </div>
            </label>

            <label className={styles.baseField}>
              <span>Applies to</span>
              <select
                name="taxLineBaseScope"
                value={line.base_scope}
                onChange={(event) =>
                  patchLine(index, {
                    base_scope: event.target
                      .value as EditorLine["base_scope"],
                  })
                }
              >
                <option value="ACCOMMODATION_TOTAL">
                  Lodging + required stay fees
                </option>
                <option value="LODGING_ONLY">Lodging only</option>
                <option value="PRE_TAX_TOTAL">All pre-tax charges</option>
              </select>
            </label>

            <button
              className={styles.removeButton}
              type="button"
              onClick={() => removeLine(index)}
              aria-label={`Remove ${line.label || "local tax line"}`}
            >
              Remove
            </button>
          </div>
        ))}

        {!lines.length ? (
          <div className={styles.empty}>
            No local tax is added yet. Use <strong>+ Add local tax</strong> if
            this property has a city, county, lodging, occupancy, tourism or
            A&amp;P tax in addition to the automatic statewide taxes.
          </div>
        ) : null}
      </div>
    </div>
  );
}
