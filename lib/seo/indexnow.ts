import { CANONICAL_SITE_URL } from "@/lib/seo";

// IndexNow uses a public domain-ownership proof, not an authentication secret.
// The matching root text file is included in this overlay. Never submit any
// private/admin/checkout URL or another host's domain.
export const INDEXNOW_PUBLIC_KEY = "3b9a6191e8754303a6c69c8d36b2a434";
export const INDEXNOW_KEY_LOCATION = `${CANONICAL_SITE_URL}/3b9a6191e8754303a6c69c8d36b2a434.txt`;

export async function submitIndexNow(urls: string[]): Promise<{ submitted: number; accepted: boolean; status?: number }> {
  const canonicalHost = new URL(CANONICAL_SITE_URL).hostname;
  const safeUrls = [...new Set(urls)].filter((input) => {
    try {
      const parsed = new URL(input);
      return parsed.protocol === "https:" && parsed.hostname === canonicalHost &&
        (parsed.pathname.startsWith("/stays/") || parsed.pathname.startsWith("/destinations")) &&
        !parsed.search && !parsed.hash;
    } catch { return false; }
  }).slice(0, 1000);
  if (!safeUrls.length) return { submitted: 0, accepted: true };

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: canonicalHost, key: INDEXNOW_PUBLIC_KEY, keyLocation: INDEXNOW_KEY_LOCATION, urlList: safeUrls }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    return { submitted: safeUrls.length, accepted: response.ok, status: response.status };
  } catch (error) {
    console.warn("[IndexNow] submission unavailable", error instanceof Error ? error.message : "Unknown error");
    return { submitted: safeUrls.length, accepted: false };
  }
}
