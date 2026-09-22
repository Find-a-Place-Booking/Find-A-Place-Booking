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

export type HostPaymentTransaction = {
  paymentId: string;
  reservationId: string;
  confirmationCode: string;
  propertyName: string;
  guestName: string | null;
  status: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  amountCents: number;
  taxCents: number;
  commissionCents: number;
  processorFeeCents: number;
  processorFeeActualCents: number;
  hostProceedsCents: number;
  currency: string;
  createdAt: string;
};

type HostReservationRow = {
  id: string;
  confirmation_code: string;
  property_id: string;
  guest_name: string | null;
  status: string;
  payment_status: string;
  check_in: string;
  check_out: string;
  guest_total_cents: number;
  tax_total_cents: number;
  platform_commission_cents: number;
  currency: string;
  created_at: string;
};

type HostPaymentRow = {
  id: string;
  reservation_id: string;
  status: string;
  amount_cents: number;
  platform_tax_retained_cents: number | null;
  processor_fee_actual_cents: number | null;
  processor_fee_host_share_cents: number | null;
  host_proceeds_cents: number | null;
  currency: string;
  created_at: string;
};

type PropertyNameRow = {
  id: string;
  name: string;
};

export async function getHostPaymentWorkspace() {
  const organizations = await getManagedOrganizations();
  const readiness = getPaymentProviderReadiness();
  const environment: "TEST" | "LIVE" =
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "LIVE" : "TEST";

  if (!organizations.length) {
    return {
      organizations,
      accounts: [] as HostPaymentAccount[],
      readiness,
      environment,
      transactions: [] as HostPaymentTransaction[],
    };
  }

  const supabase = await createClient();
  const organizationIds = organizations.map((organization) => organization.id);

  const [accountsResult, reservationsResult] = await Promise.all([
    supabase
      .from("payment_accounts")
      .select(
        "id,organization_id,provider,connection_mode,provider_account_id,provider_location_id,status,environment,is_default,currency,charges_enabled,payouts_enabled,created_at",
      )
      .in("organization_id", organizationIds)
      .eq("environment", environment)
      .neq("status", "DISABLED")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("reservations")
      .select(
        "id,confirmation_code,property_id,guest_name,status,payment_status,check_in,check_out,guest_total_cents,tax_total_cents,platform_commission_cents,currency,created_at",
      )
      .in("organization_id", organizationIds)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (accountsResult.error) {
    throw new Error("Unable to load connected payment accounts.");
  }

  if (reservationsResult.error) {
    throw new Error("Unable to load host payment transactions.");
  }

  const reservations = (reservationsResult.data ?? []) as HostReservationRow[];
  const reservationIds = reservations.map((reservation) => reservation.id);
  const propertyIds = [
    ...new Set(reservations.map((reservation) => reservation.property_id)),
  ];

  const [paymentsResult, propertiesResult] = await Promise.all([
    reservationIds.length
      ? supabase
          .from("payments")
          .select(
            "id,reservation_id,status,amount_cents,platform_tax_retained_cents,processor_fee_actual_cents,processor_fee_host_share_cents,host_proceeds_cents,currency,created_at",
          )
          .in("reservation_id", reservationIds)
          .eq("payment_environment", environment)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as HostPaymentRow[], error: null }),
    propertyIds.length
      ? supabase.from("properties").select("id,name").in("id", propertyIds)
      : Promise.resolve({ data: [] as PropertyNameRow[], error: null }),
  ]);

  if (paymentsResult.error || propertiesResult.error) {
    throw new Error("Unable to resolve host payment transactions.");
  }

  const payments = (paymentsResult.data ?? []) as HostPaymentRow[];
  const properties = (propertiesResult.data ?? []) as PropertyNameRow[];

  const paymentByReservation = new Map<string, HostPaymentRow>();
  for (const payment of payments) {
    if (!paymentByReservation.has(payment.reservation_id)) {
      paymentByReservation.set(payment.reservation_id, payment);
    }
  }

  const propertyById = new Map(
    properties.map((property) => [property.id, property.name]),
  );

  const transactions: HostPaymentTransaction[] = reservations.flatMap(
    (reservation) => {
      const payment = paymentByReservation.get(reservation.id);
      if (!payment) return [];

      return [
        {
          paymentId: payment.id,
          reservationId: reservation.id,
          confirmationCode: reservation.confirmation_code,
          propertyName:
            propertyById.get(reservation.property_id) ?? "Find A Place stay",
          guestName: reservation.guest_name,
          status: payment.status,
          paymentStatus: reservation.payment_status,
          checkIn: reservation.check_in,
          checkOut: reservation.check_out,
          amountCents: Number(payment.amount_cents),
          taxCents: Number(
            payment.platform_tax_retained_cents ?? reservation.tax_total_cents ?? 0,
          ),
          commissionCents: Number(reservation.platform_commission_cents ?? 0),
          processorFeeCents: Number(payment.processor_fee_host_share_cents ?? 0),
          processorFeeActualCents: Number(payment.processor_fee_actual_cents ?? 0),
          hostProceedsCents: Number(payment.host_proceeds_cents ?? 0),
          currency: payment.currency || reservation.currency || "USD",
          createdAt: payment.created_at,
        },
      ];
    },
  );

  return {
    organizations,
    accounts: (accountsResult.data ?? []) as HostPaymentAccount[],
    readiness,
    environment,
    transactions,
  };
}
