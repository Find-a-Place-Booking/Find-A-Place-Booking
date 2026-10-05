export const DEFAULT_PROPERTY_TIME_ZONE = "America/Chicago";

export function propertyTimeZone(value: string | null | undefined) {
  const candidate = value?.trim() || DEFAULT_PROPERTY_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_PROPERTY_TIME_ZONE;
  }
}

export function formatPropertyDateTime(
  value: string | Date | null | undefined,
  timeZone?: string | null,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: propertyTimeZone(timeZone),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
  }).format(date);
}
