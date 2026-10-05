export const SAVED_STAYS_KEY = "find-a-place:saved-stays:v1";
export const SAVED_STAYS_EVENT = "find-a-place:saved-stays-changed";
export const MAX_SAVED_STAYS = 50;

function normalize(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item)),
    ),
  ].slice(0, MAX_SAVED_STAYS);
}

export function readSavedStaySlugs() {
  if (typeof window === "undefined") return [];

  try {
    return normalize(
      JSON.parse(window.localStorage.getItem(SAVED_STAYS_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}

export function isStaySaved(slug: string) {
  return readSavedStaySlugs().includes(slug);
}

export function setStaySaved(slug: string, saved: boolean) {
  if (typeof window === "undefined") return [];

  const normalizedSlug = slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    return readSavedStaySlugs();
  }

  const current = readSavedStaySlugs();
  const next = saved
    ? [normalizedSlug, ...current.filter((item) => item !== normalizedSlug)]
        .slice(0, MAX_SAVED_STAYS)
    : current.filter((item) => item !== normalizedSlug);

  try {
    window.localStorage.setItem(SAVED_STAYS_KEY, JSON.stringify(next));
  } catch {
    return current;
  }

  window.dispatchEvent(
    new CustomEvent(SAVED_STAYS_EVENT, {
      detail: { slugs: next },
    }),
  );

  return next;
}

export function subscribeToSavedStays(callback: (slugs: string[]) => void) {
  if (typeof window === "undefined") return () => {};

  function onChanged(event: Event) {
    const custom = event as CustomEvent<{ slugs?: string[] }>;
    callback(
      Array.isArray(custom.detail?.slugs)
        ? normalize(custom.detail.slugs)
        : readSavedStaySlugs(),
    );
  }

  function onStorage(event: StorageEvent) {
    if (event.key && event.key !== SAVED_STAYS_KEY) return;
    callback(readSavedStaySlugs());
  }

  window.addEventListener(SAVED_STAYS_EVENT, onChanged);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(SAVED_STAYS_EVENT, onChanged);
    window.removeEventListener("storage", onStorage);
  };
}
