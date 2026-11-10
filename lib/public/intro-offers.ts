import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type IntroOffer = {
  propertyId: string;
  unitId: string;
  code: string;
  remaining: number;
};

type IntroOfferRow = { property_id: string; unit_id: string; code: string; remaining: number };

/** Returns only published, eligible intro offers. Does not modify promotion usage. */
export async function getPublicIntroOffers(unitId?: string): Promise<IntroOffer[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fap_public_intro_offers", {
    target_unit_id: unitId || null,
  });
  if (error) {
    // Safe fail-closed: never advertise an offer that checkout may be unable to honor.
    console.error("[FAP intro offers] lookup unavailable", {
      code: error.code, message: error.message,
    });
    return [];
  }
  return ((data ?? []) as IntroOfferRow[]).filter((row) =>
    row.code?.startsWith("FAP25-") && Number(row.remaining) > 0,
  ).map((row) => ({
    propertyId: row.property_id,
    unitId: row.unit_id,
    code: row.code,
    remaining: Number(row.remaining),
  }));
}

export async function getPublicIntroOfferForUnit(unitId: string): Promise<IntroOffer | null> {
  return (await getPublicIntroOffers(unitId)).find((row) => row.unitId === unitId) ?? null;
}
