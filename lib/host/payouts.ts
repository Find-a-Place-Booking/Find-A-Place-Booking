import { getManagedOrganizations } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

export type HostPayoutRow = {
  id: string;
  reservationId: string;
  confirmationCode: string;
  propertyName: string;
  amountCents: number;
  currency: string;
  cancellationCutoffDate: string;
  payoutEligibleDate: string;
  status: string;
  initiatedAt: string | null;
  estimatedArrivalAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  lastError: string | null;
};

export async function getHostPayoutWorkspace() {
  const organizations = await getManagedOrganizations();
  if (!organizations.length) {
    return { organizations, payouts: [] as HostPayoutRow[] };
  }

  const supabase = await createClient();
  const organizationIds = organizations.map((organization) => organization.id);
  const { data, error } = await supabase
    .from("reservation_payouts")
    .select(
      "id,reservation_id,property_id,confirmation_code,amount_cents,currency,cancellation_cutoff_date,payout_eligible_date,status,initiated_at,estimated_arrival_at,paid_at,failed_at,last_error",
    )
    .in("organization_id", organizationIds)
    .order("payout_eligible_date", { ascending: false })
    .limit(150);

  if (error) {
    throw new Error("Unable to load host payout schedule.");
  }

  const propertyIds = [...new Set((data ?? []).map((row) => row.property_id))];
  const propertyNames = new Map<string, string>();
  if (propertyIds.length) {
    const { data: properties } = await supabase
      .from("properties")
      .select("id,name")
      .in("id", propertyIds);
    for (const property of properties ?? []) {
      propertyNames.set(property.id, property.name);
    }
  }

  return {
    organizations,
    payouts: (data ?? []).map((row) => ({
      id: row.id,
      reservationId: row.reservation_id,
      confirmationCode: row.confirmation_code,
      propertyName: propertyNames.get(row.property_id) || "Find A Place stay",
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      cancellationCutoffDate: row.cancellation_cutoff_date,
      payoutEligibleDate: row.payout_eligible_date,
      status: row.status,
      initiatedAt: row.initiated_at,
      estimatedArrivalAt: row.estimated_arrival_at,
      paidAt: row.paid_at,
      failedAt: row.failed_at,
      lastError: row.last_error,
    })) satisfies HostPayoutRow[],
  };
}
