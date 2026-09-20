import {
  guestReceiptLines,
  type GuestTaxLine,
} from "@/lib/bookings/financial-display";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
}

function rateLabel(rateBps: number) {
  if (!rateBps) return "";
  const percent = rateBps / 100;
  return ` (${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%)`;
}

export function BookingReceipt({
  pricingSnapshot,
  preTaxTotalCents,
  taxTotalCents,
  guestTotalCents,
  currency = "USD",
  taxLines = [],
}: {
  pricingSnapshot: unknown;
  preTaxTotalCents: number;
  taxTotalCents: number;
  guestTotalCents: number;
  currency?: string;
  taxLines?: GuestTaxLine[];
}) {
  const priceLines = guestReceiptLines(
    pricingSnapshot,
    preTaxTotalCents,
  );

  return (
    <div>
      {priceLines.map((line, index) => (
        <div className="setting-row" key={`${line.label}-${index}`}>
          <span>{line.label}</span>
          <strong>
            {line.negative ? "−" : ""}
            {money(line.amountCents, currency)}
          </strong>
        </div>
      ))}

      <div className="setting-row">
        <span>Subtotal before taxes</span>
        <strong>{money(preTaxTotalCents, currency)}</strong>
      </div>

      {taxLines.length ? (
        taxLines.map((line, index) => (
          <div className="setting-row" key={`${line.label}-${index}`}>
            <span>
              {line.label}
              {rateLabel(line.rateBps)}
            </span>
            <strong>{money(line.amountCents, currency)}</strong>
          </div>
        ))
      ) : (
        <div className="setting-row">
          <span>Taxes</span>
          <strong>{money(taxTotalCents, currency)}</strong>
        </div>
      )}

      <div className="setting-row">
        <span>Total charged</span>
        <strong>{money(guestTotalCents, currency)}</strong>
      </div>
    </div>
  );
}
