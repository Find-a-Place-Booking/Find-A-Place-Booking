import {
  guestReceiptLines,
  type GuestTaxLine,
} from "@/lib/bookings/financial-display";
import { DirectBookingValue } from "@/components/DirectBookingValue";

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
  unitId, checkIn, checkOut, guestCount,
}: {
  pricingSnapshot: unknown;
  preTaxTotalCents: number;
  taxTotalCents: number;
  guestTotalCents: number;
  currency?: string;
  taxLines?: GuestTaxLine[];
  unitId?: string;
  checkIn?: string;
  checkOut?: string;
  guestCount?: number;
}) {
  // The preview assumes no pets, optional add-ons or promotions. Avoid
  // showing a comparison on receipts whose selections differ from that basis.
  const snapshot = pricingSnapshot && typeof pricingSnapshot === "object" &&
    !Array.isArray(pricingSnapshot) ? pricingSnapshot as Record<string, unknown> : {};
  const comparisonUnitId = unitId || (typeof snapshot.unit_id === "string" ? snapshot.unit_id : undefined);
  const comparisonCheckIn = checkIn || (typeof snapshot.check_in === "string" ? snapshot.check_in : undefined);
  const comparisonCheckOut = checkOut || (typeof snapshot.check_out === "string" ? snapshot.check_out : undefined);
  const comparisonGuests = guestCount || (Number.isInteger(Number(snapshot.guest_count)) ? Number(snapshot.guest_count) : undefined);
  const hasDifferentBookingOptions =
    Number(snapshot.pet_fee_cents || 0) > 0 ||
    Number(snapshot.discount_cents || 0) > 0 ||
    Number(snapshot.add_on_subtotal_cents || 0) > 0;
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
      {!hasDifferentBookingOptions && comparisonUnitId && comparisonCheckIn && comparisonCheckOut && comparisonGuests ? (
        <DirectBookingValue compact unitId={comparisonUnitId} checkIn={comparisonCheckIn}
          checkOut={comparisonCheckOut} guests={comparisonGuests} currency={currency}
          receiptPreTaxTotalCents={preTaxTotalCents} />
      ) : null}
    </div>
  );
}
