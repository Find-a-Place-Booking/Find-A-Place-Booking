"use client";

export function PrintReceiptButton() {
  return (
    <button
      className="button button-small button-quiet"
      type="button"
      onClick={() => window.print()}
    >
      Print receipt
    </button>
  );
}
