export const WEBAPP_RELEASE = process.env.NEXT_PUBLIC_FAP_WEBAPP_RELEASE || "";
export const UPDATE_INTERVAL_MS = 5 * 60 * 1000;
export const UPDATE_TIMEOUT_MS = 10 * 1000;
export const AUTO_CHECK_MIN_INTERVAL_MS = 30 * 1000;

export type ReleaseStatus = { state: "current" | "available"; version: string };

export function validRelease(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** Compare only the deployed, public build identifiers. Never send account data. */
export async function checkWebAppRelease(
  current: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ReleaseStatus> {
  if (!validRelease(current)) throw new Error("Current app version unavailable");
  const response = await fetcher("/api/mobile/v1/app-version", {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Unable to check app version");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("version" in data) || !validRelease(data.version)) {
    throw new Error("Invalid app version response");
  }
  return { state: data.version === current ? "current" : "available", version: data.version };
}
