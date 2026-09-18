import { getManagedOrganizations } from "@/lib/host/properties";
import { getPaymentProviderReadiness } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";

export type HostPaymentAccount = {
  id: string;
  organization_id: string;
  provider: "STRIPE" | "SQUARE";
  connection_mode: string;
  provider_account_id: string | null;
  provider_location_id: string | null;
  status: string;
  environment: "TEST" | "LIVE";
  is_default: boolean;
  currency: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  created_at: string;
};

export async function getHostPaymentWorkspace() {
  const organizations = await getManagedOrganizations();
  const readiness = getPaymentProviderReadiness();
  const environment: "TEST" | "LIVE" = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
    ? "LIVE"
    : "TEST";
  if (!organizations.length) return { organizations, accounts: [] as HostPaymentAccount[], readiness, environment };

  const supabase = await createClient();
  const organizationIds = organizations.map((organization) => organization.id);
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("id,organization_id,provider,connection_mode,provider_account_id,provider_location_id,status,environment,is_default,currency,charges_enabled,payouts_enabled,created_at")
    .in("organization_id", organizationIds)
    .eq("environment", environment)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error("Unable to load payment accounts. Apply Milestone 10A migration 016 and refresh.");
  return { organizations, accounts: (data ?? []) as HostPaymentAccount[], readiness, environment };
}
