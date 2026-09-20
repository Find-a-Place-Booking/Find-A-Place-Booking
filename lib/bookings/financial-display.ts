export type GuestTaxLine = {
  label: string;
  rateBps: number;
  amountCents: number;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function cents(record: JsonRecord, key: string) {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function taxLinesFromSnapshot(value: unknown): GuestTaxLine[] {
  const snapshot = asRecord(value);
  const rules = Array.isArray(snapshot.rules) ? snapshot.rules : [];

  return rules
    .map((item) => {
      const rule = asRecord(item);
      const amountCents = cents(rule, "tax_cents");
      const rateBps = cents(rule, "rate_bps");
      const label =
        typeof rule.label === "string" && rule.label.trim()
          ? rule.label.trim()
          : typeof rule.authority_name === "string" && rule.authority_name.trim()
            ? rule.authority_name.trim()
            : "Lodging tax";

      return { label, rateBps, amountCents };
    })
    .filter((line) => line.amountCents > 0);
}

export type GuestReceiptLine = {
  label: string;
  amountCents: number;
  negative?: boolean;
};

export function guestReceiptLines(
  pricingSnapshot: unknown,
  fallbackPreTaxTotalCents: number,
): GuestReceiptLine[] {
  const pricing = asRecord(pricingSnapshot);
  const lodgingAfterDiscount = cents(pricing, "lodging_subtotal_cents");
  const lodgingBeforeDiscount = cents(
    pricing,
    "lodging_subtotal_before_discount_cents",
  );
  const discountCents = cents(pricing, "discount_cents");
  const cleaningCents = cents(pricing, "cleaning_fee_cents");
  const petCents = cents(pricing, "pet_fee_cents");
  const extraGuestCents = cents(pricing, "extra_guest_fee_cents");
  const addOnSubtotal = cents(pricing, "add_on_subtotal_cents");
  const addOns = Array.isArray(pricing.add_on_lines)
    ? pricing.add_on_lines
    : [];

  const lines: GuestReceiptLine[] = [];

  if (lodgingBeforeDiscount > 0 && discountCents > 0) {
    lines.push({ label: "Lodging", amountCents: lodgingBeforeDiscount });
    lines.push({
      label: "Promotion discount",
      amountCents: discountCents,
      negative: true,
    });
  } else if (lodgingAfterDiscount > 0) {
    lines.push({ label: "Lodging", amountCents: lodgingAfterDiscount });
  }

  if (cleaningCents > 0) {
    lines.push({ label: "Cleaning fee", amountCents: cleaningCents });
  }
  if (petCents > 0) {
    lines.push({ label: "Pet fee", amountCents: petCents });
  }
  if (extraGuestCents > 0) {
    lines.push({ label: "Extra guest fee", amountCents: extraGuestCents });
  }

  const addOnLines = addOns
    .map((item) => {
      const addOn = asRecord(item);
      const amountCents = cents(addOn, "amount_cents");
      const label =
        typeof addOn.name === "string" && addOn.name.trim()
          ? addOn.name.trim()
          : "Add-on";
      return { label, amountCents };
    })
    .filter((line) => line.amountCents > 0);

  if (addOnLines.length) {
    lines.push(...addOnLines);
  } else if (addOnSubtotal > 0) {
    lines.push({ label: "Add-ons", amountCents: addOnSubtotal });
  }

  if (!lines.length && fallbackPreTaxTotalCents > 0) {
    lines.push({
      label: "Stay subtotal",
      amountCents: fallbackPreTaxTotalCents,
    });
  }

  return lines;
}
