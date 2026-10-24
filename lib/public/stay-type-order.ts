/** Guest-facing category ordering only. No booking, price, or availability rules change. */
export function isCampingOrRv(type: string | null | undefined, name: string): boolean {
  const kind = (type || "").trim().toLowerCase();
  if (["rv site", "campsite", "campground", "tent site"].includes(kind)) return true;
  // "Other" can also describe cabins, converted cabooses and unusual stays.
  return kind === "other" && /\b(camping\s+site|camp\s*site|campsite|tent\s+site|rv\s+site)\b/i.test(name);
}
