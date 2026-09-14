import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Batch-sign private Storage objects in bounded chunks and return a path->URL map.
 * One failed chunk is isolated so a single Storage error does not take down the
 * entire listing/admin page.
 */
export async function createSignedUrlMap(
  supabase: SupabaseClient,
  bucket: string,
  paths: Array<string | null | undefined>,
  expiresIn = 3600,
  chunkSize = 100,
) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const result = new Map<string, string>();
  if (!uniquePaths.length) return result;

  const storage = supabase.storage.from(bucket);
  for (let index = 0; index < uniquePaths.length; index += chunkSize) {
    const chunk = uniquePaths.slice(index, index + chunkSize);
    const { data, error } = await storage.createSignedUrls(chunk, expiresIn);
    if (error || !data) continue;
    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) result.set(item.path, item.signedUrl);
    }
  }
  return result;
}
