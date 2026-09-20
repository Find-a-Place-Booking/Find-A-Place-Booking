export type ReportRange = { from: string; to: string };

export function normalizeReportRange(from?: string | null, to?: string | null): ReportRange {
  const now = new Date();
  const year = now.getUTCFullYear();
  const fallbackFrom = `${year}-01-01`;
  const fallbackTo = `${year}-12-31`;
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  let safeFrom = from && valid.test(from) ? from : fallbackFrom;
  let safeTo = to && valid.test(to) ? to : fallbackTo;
  if (safeFrom > safeTo) [safeFrom, safeTo] = [safeTo, safeFrom];
  return { from: safeFrom, to: safeTo };
}

export function reportMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(cents || 0) / 100);
}

export function stayNights(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T12:00:00Z`).getTime();
  const end = new Date(`${checkOut}T12:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86400000);
}

export function chunk<T>(values: T[], size = 250): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvLine(values: unknown[]) {
  return values.map(csvCell).join(",");
}
