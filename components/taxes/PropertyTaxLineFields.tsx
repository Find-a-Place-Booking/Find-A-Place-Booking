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

type EditorLine = PropertyTaxLineInput & { key: string };

function rateText(rateBps: number) {
  return (Number(rateBps || 0) / 100).toFixed(rateBps % 100 ? 2 : 0);
}

function makeInitialLines(
  stateCode: string,
  initialLines: PropertyTaxLineInput[],
): EditorLine[] {
  if (initialLines.length) {
    return initialLines.map((line, index) => ({
      ...line,
      key: line.id || `existing-${index}`,
    }));
  }

  const config = getStateTaxSetup(stateCode);
  return config.suggestedLines.map((line, index) => ({
    key: `suggested-${index}`,
    category: line.category,
    label: line.label,
    rate_bps: 0,
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

  function addLine() {
    setLines((current) => {
      if (current.length >= 12) return current;
      return [
        ...current,
        {
          key: `new-${Date.now()}-${current.length}`,
          category: "OTHER",
          label: "",
          rate_bps: 0,
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
        </div>
        <button type="button" onClick={addLine} disabled={lines.length >= 12}>
          + Add tax
        </button>
      </div>

      <div className={styles.lines}>
        {lines.map((line, index) => (
          <div className={styles.line} key={line.key}>
            <label className={styles.typeField}>
              <span>Type</span>
              <select
                name="taxLineCategory"
                value={line.category}
                onChange={(event) =>
                  patchLine(index, {
                    category: event.target.value as EditorLine["category"],
                  })
                }
              >
                <option value="LOCAL_SALES">Sales tax</option>
                <option value="LOCAL_LODGING">Lodging / occupancy</option>
                <option value="OTHER">Other tax</option>
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
                placeholder="Local lodging tax"
                maxLength={160}
              />
            </label>

            <label className={styles.rateField}>
              <span>Rate</span>
              <div className={styles.rateInput}>
                <input
                  name="taxLineRatePercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.001"
                  inputMode="decimal"
                  value={rateText(line.rate_bps)}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value);
                    patchLine(index, {
                      rate_bps: Number.isFinite(parsed)
                        ? Math.round(parsed * 100)
                        : 0,
                    });
                  }}
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
              aria-label={`Remove ${line.label || "tax line"}`}
            >
              Remove
            </button>
          </div>
        ))}

        {!lines.length ? (
          <div className={styles.empty}>
            No local tax lines added. Use <strong>+ Add tax</strong> if a local
            tax applies to this property.
          </div>
        ) : null}
      </div>
    </div>
  );
}
