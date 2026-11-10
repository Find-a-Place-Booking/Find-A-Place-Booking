export const API_BASE = "";
export class WebAppApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "WebAppApiError";
  }
}
export async function api<T>(
  path: string,
  _token?: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  organizationId?: string,
): Promise<T> {
  if (!path.startsWith("/api/mobile/v1/"))
    throw new Error("Invalid app request.");
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(organizationId ? { "X-Fap-Organization": organizationId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (
      path.includes("/host/") &&
      [401, 402, 403].includes(response.status) &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new CustomEvent("fap-host-access-lost"));
    throw new WebAppApiError(
      typeof data?.error === "string" ? data.error : "Request failed.",
      response.status,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new WebAppApiError(
      "The server returned an unexpected response. Please retry.",
      502,
    );
  return data as T;
}
export function cash(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}
export function dateLabel(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export async function openWebsite(path: string) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid destination.");
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin)
    throw new Error("Invalid destination.");
  window.location.assign(url.toString());
}
