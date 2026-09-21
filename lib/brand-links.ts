export const FIND_A_PLACE_NETWORK_URL = "https://www.findaplacear.com";
export const FIND_A_PLACE_SUPPORT_EMAIL = "findaplacearkansas@gmail.com";

export const FIND_A_PLACE_SOCIAL_LINKS = [
  {
    network: "facebook" as const,
    label: "Facebook",
    href: "https://www.facebook.com/findaplacear",
  },
  {
    network: "instagram" as const,
    label: "Instagram",
    href: "https://www.instagram.com/findaplacear/",
  },
  {
    network: "tiktok" as const,
    label: "TikTok",
    href: "https://www.tiktok.com/@findaplacear",
  },
  {
    network: "lemon8" as const,
    label: "Lemon8",
    href: "https://www.lemon8-app.com/@findaplacear?region=us",
  },
] as const;

export function findAPlaceMailto(subject: string, body?: string) {
  const query = new URLSearchParams({ subject });
  if (body) query.set("body", body);
  return `mailto:${FIND_A_PLACE_SUPPORT_EMAIL}?${query.toString()}`;
}
