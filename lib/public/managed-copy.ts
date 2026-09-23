import { getSiteContentBlocks } from "@/lib/public/site-content";

export type ManagedCopyFallback = {
  eyebrow?: string;
  title: string;
  body?: string;
};

export type ManagedCopyBlock = {
  key: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
};

export async function loadManagedCopy(
  fallbacks: Record<string, ManagedCopyFallback>,
) {
  const keys = Object.keys(fallbacks);
  const stored = await getSiteContentBlocks(keys);
  const result = new Map<string, ManagedCopyBlock>();

  for (const key of keys) {
    const fallback = fallbacks[key];
    const row = stored.get(key);
    result.set(key, {
      key,
      eyebrow: row?.eyebrow ?? (fallback.eyebrow ?? null),
      title: row?.title || fallback.title,
      body: row?.body ?? (fallback.body ?? null),
    });
  }

  return result;
}

export function copyBlock(
  content: Map<string, ManagedCopyBlock>,
  key: string,
) {
  const block = content.get(key);
  if (!block) throw new Error(`Managed copy block "${key}" was not loaded.`);
  return block;
}
