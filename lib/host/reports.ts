import { getHostProperties, getManagedOrganizations } from "@/lib/host/properties";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { chunk, normalizeReportRange, stayNights } from "@/lib/reports/common";
import { createClient } from "@/lib/supabase/server";

const settledPaymentStatuses = new Set([
  "SUCCEEDED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "DISPUTED",
]);

type Filters = {
  from?: string | null;
  to?: string | null;
  propertyId?: string | null;
};

type ReservationRow = {
  id: string;
  property_id: string;
  unit_id: string;
  confirmation_code: string;
  status: string;
  payment_status: string;
  check_in: string;
  check_out: string;
  guest_name: string | null;
  guest_total_cents: number;
  tax_total_cents: number;
  platform_commission_cents: number;
  currency: string;
  created_at: string;
};

type PaymentRow = {
  id: string;
  reservation_id: string;
  status: string;
  amount_cents: number;
  platform_tax_retained_cents: number | null;
  processor_fee_host_share_cents: number | null;
  processor_fee_actual_cents: number | null;
  host_proceeds_cents: number | null;
  currency: string;
  created_at: string;
};

type RefundRow = {
  reservation_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  created_at: string;
};

export type HostReportReservation = {
  reservationId: string;
  confirmationCode: string;
  propertyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  paymentStatus: string;
  guestPaidCents: number;
  taxCents: number;
  commissionCents: number;
  processingCents: number;
  hostProceedsCents: number;
  refundCents: number;
  currency: string;
};

export type HostReportProperty = {
  propertyId: string;
  propertyName: string;
  reservations: number;
  confirmedStays: number;
  cancelledStays: number;
  bookedNights: number;
  grossGuestCents: number;
  taxCents: number;
  commissionCents: number;
  processingCents: number;
  hostProceedsCents: number;
  refundCents: number;
  currency: string;
};

async function loadByReservation<T>(
  ids: string[],
  loader: (ids: string[]) => Promise<{
    data: T[] | null;
    error: { message?: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (const idsChunk of chunk(ids)) {
    const result = await loader(idsChunk);
    if (result.error) {
      throw new Error(result.error.message || "Unable to load report records.");
    }
    rows.push(...(result.data ?? []));
  }
  return rows;
}

export async function getHostReport(filters: Filters = {}) {
  const [organizations, properties] = await Promise.all([
    getManagedOrganizations(),
    getHostProperties(),
  ]);
  const range = normalizeReportRange(filters.from, filters.to);
  const environment = stripeEnvironment();
  const propertyFilter =
    filters.propertyId &&
    properties.some((property) => property.id === filters.propertyId)
      ? filters.propertyId
      : null;

  if (!organizations.length || !properties.length) {
    return emptyHostReport({ range, environment, properties, propertyFilter });
  }

  const supabase = await createClient();
  const organizationIds = organizations.map((organization) => organization.id);
  let reservationQuery = supabase
    .from("reservations")
    .select(
      "id,property_id,unit_id,confirmation_code,status,payment_status,check_in,check_out,guest_name,guest_total_cents,tax_total_cents,platform_commission_cents,currency,created_at",
    )
    .in("organization_id", organizationIds)
    .eq("payment_environment", environment)
    .lte("check_in", range.to)
    .gte("check_out", range.from)
    .order("check_in", { ascending: false })
    .limit(5000);
  if (propertyFilter) {
    reservationQuery = reservationQuery.eq("property_id", propertyFilter);
  }

  const { data: reservationData, error: reservationError } =
    await reservationQuery;
  if (reservationError) {
    throw new Error("Unable to load host reporting reservations.");
  }
  const reservations = (reservationData ?? []) as ReservationRow[];
  const reservationIds = reservations.map((reservation) => reservation.id);

  const payments = reservationIds.length
    ? await loadByReservation<PaymentRow>(reservationIds, async (ids) => {
        const result = await supabase
          .from("payments")
          .select(
            "id,reservation_id,status,amount_cents,platform_tax_retained_cents,processor_fee_host_share_cents,processor_fee_actual_cents,host_proceeds_cents,currency,created_at",
          )
          .in("reservation_id", ids)
          .eq("payment_environment", environment)
          .order("created_at", { ascending: false });
        return { data: (result.data ?? []) as PaymentRow[], error: result.error };
      })
    : [];

  const refunds = reservationIds.length
    ? await loadByReservation<RefundRow>(reservationIds, async (ids) => {
        const result = await supabase
          .from("refunds")
          .select("reservation_id,status,amount_cents,currency,created_at")
          .in("reservation_id", ids)
          .eq("payment_environment", environment)
          .eq("status", "SUCCEEDED");
        return { data: (result.data ?? []) as RefundRow[], error: result.error };
      })
    : [];

  const latestPayment = new Map<string, PaymentRow>();
  for (const payment of payments) {
    if (!latestPayment.has(payment.reservation_id)) {
      latestPayment.set(payment.reservation_id, payment);
    }
  }

  const refundsByReservation = new Map<string, number>();
  for (const refund of refunds) {
    refundsByReservation.set(
      refund.reservation_id,
      (refundsByReservation.get(refund.reservation_id) ?? 0) +
        Number(refund.amount_cents || 0),
    );
  }

  const propertyNames = new Map(
    properties.map((property) => [property.id, property.name]),
  );

  const rows: HostReportReservation[] = reservations.map((reservation) => {
    const payment = latestPayment.get(reservation.id);
    const settled = payment && settledPaymentStatuses.has(payment.status);
    return {
      reservationId: reservation.id,
      confirmationCode: reservation.confirmation_code,
      propertyName:
        propertyNames.get(reservation.property_id) ?? "Find A Place stay",
      guestName: reservation.guest_name || "Guest",
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
      status: reservation.status,
      paymentStatus: reservation.payment_status,
      guestPaidCents: settled ? Number(payment.amount_cents || 0) : 0,
      taxCents: settled ? Number(reservation.tax_total_cents || 0) : 0,
      commissionCents: settled
        ? Number(reservation.platform_commission_cents || 0)
        : 0,
      processingCents: settled
        ? Number(
            payment.processor_fee_actual_cents ??
              payment.processor_fee_host_share_cents ??
              0,
          )
        : 0,
      hostProceedsCents: settled ? Number(payment.host_proceeds_cents || 0) : 0,
      refundCents: refundsByReservation.get(reservation.id) ?? 0,
      currency: payment?.currency || reservation.currency || "USD",
    };
  });

  const rowByReservation = new Map(
    rows.map((row) => [row.reservationId, row]),
  );
  const bucketByProperty = new Map<string, HostReportProperty>();
  for (const property of properties.filter(
    (property) => !propertyFilter || property.id === propertyFilter,
  )) {
    bucketByProperty.set(property.id, {
      propertyId: property.id,
      propertyName: property.name,
      reservations: 0,
      confirmedStays: 0,
      cancelledStays: 0,
      bookedNights: 0,
      grossGuestCents: 0,
      taxCents: 0,
      commissionCents: 0,
      processingCents: 0,
      hostProceedsCents: 0,
      refundCents: 0,
      currency: "USD",
    });
  }

  for (const reservation of reservations) {
    const bucket = bucketByProperty.get(reservation.property_id);
    if (!bucket) continue;
    const row = rowByReservation.get(reservation.id)!;
    bucket.reservations += 1;
    if (reservation.status === "CONFIRMED") {
      bucket.confirmedStays += 1;
      bucket.bookedNights += stayNights(
        reservation.check_in,
        reservation.check_out,
      );
    }
    if (reservation.status === "CANCELLED") bucket.cancelledStays += 1;
    bucket.grossGuestCents += row.guestPaidCents;
    bucket.taxCents += row.taxCents;
    bucket.commissionCents += row.commissionCents;
    bucket.processingCents += row.processingCents;
    bucket.hostProceedsCents += row.hostProceedsCents;
    bucket.refundCents += row.refundCents;
    bucket.currency = row.currency || bucket.currency;
  }

  const propertyBreakdown = [...bucketByProperty.values()]
    .filter((bucket) => bucket.reservations > 0)
    .sort((a, b) => b.grossGuestCents - a.grossGuestCents);

  const totals = rows.reduce(
    (sum, row) => ({
      grossGuestCents: sum.grossGuestCents + row.guestPaidCents,
      taxCents: sum.taxCents + row.taxCents,
      commissionCents: sum.commissionCents + row.commissionCents,
      processingCents: sum.processingCents + row.processingCents,
      hostProceedsCents: sum.hostProceedsCents + row.hostProceedsCents,
      refundCents: sum.refundCents + row.refundCents,
    }),
    {
      grossGuestCents: 0,
      taxCents: 0,
      commissionCents: 0,
      processingCents: 0,
      hostProceedsCents: 0,
      refundCents: 0,
    },
  );

  return {
    range,
    environment,
    properties,
    propertyFilter,
    totals: {
      ...totals,
      reservations: rows.length,
      confirmedStays: reservations.filter(
        (reservation) => reservation.status === "CONFIRMED",
      ).length,
      cancelledStays: reservations.filter(
        (reservation) => reservation.status === "CANCELLED",
      ).length,
      bookedNights: reservations
        .filter((reservation) => reservation.status === "CONFIRMED")
        .reduce(
          (sum, reservation) =>
            sum + stayNights(reservation.check_in, reservation.check_out),
          0,
        ),
    },
    propertyBreakdown,
    rows,
  };
}

function emptyHostReport({
  range,
  environment,
  properties,
  propertyFilter,
}: {
  range: { from: string; to: string };
  environment: "TEST" | "LIVE";
  properties: Awaited<ReturnType<typeof getHostProperties>>;
  propertyFilter: string | null;
}) {
  return {
    range,
    environment,
    properties,
    propertyFilter,
    totals: {
      reservations: 0,
      confirmedStays: 0,
      cancelledStays: 0,
      bookedNights: 0,
      grossGuestCents: 0,
      taxCents: 0,
      commissionCents: 0,
      processingCents: 0,
      hostProceedsCents: 0,
      refundCents: 0,
    },
    propertyBreakdown: [] as HostReportProperty[],
    rows: [] as HostReportReservation[],
  };
}
