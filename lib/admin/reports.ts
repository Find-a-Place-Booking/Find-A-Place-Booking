import { getAdminContext } from "@/lib/admin/context";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { chunk, normalizeReportRange, stayNights } from "@/lib/reports/common";
import { createClient } from "@/lib/supabase/server";

const settledPaymentStatuses = new Set(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"]);
type Filters = { from?: string | null; to?: string | null; propertyId?: string | null; organizationId?: string | null };

type ReservationRow = { id: string; organization_id: string; property_id: string; confirmation_code: string; guest_name: string | null; status: string; payment_status: string; check_in: string; check_out: string; tax_total_cents: number; platform_commission_cents: number; currency: string; created_at: string };
type PaymentRow = { id: string; reservation_id: string; status: string; amount_cents: number; platform_tax_retained_cents: number | null; processor_fee_host_share_cents: number | null; processor_fee_actual_cents: number | null; host_proceeds_cents: number | null; currency: string; created_at: string };
type RefundRow = { reservation_id: string; status: string; amount_cents: number; currency: string; created_at: string };
type PayoutRow = { reservation_id: string; status: string; amount_cents: number; currency: string; paid_at: string | null };

type Breakdown = { id: string; name: string; reservations: number; confirmedStays: number; cancelledStays: number; bookedNights: number; grossGuestCents: number; taxCents: number; commissionCents: number; processingCents: number; hostProceedsCents: number; refundCents: number; paidPayoutCents: number };

async function loadChunks<T>(ids: string[], loader: (ids: string[]) => Promise<{ data: T[] | null; error: { message?: string } | null }>) {
  const rows: T[] = [];
  for (const idsChunk of chunk(ids)) {
    const result = await loader(idsChunk);
    if (result.error) throw new Error(result.error.message || "Unable to load admin report records.");
    rows.push(...(result.data ?? []));
  }
  return rows;
}

export async function getAdminReport(filters: Filters = {}) {
  const context = await getAdminContext();
  const supabase = await createClient();
  const environment = stripeEnvironment();
  const range = normalizeReportRange(filters.from, filters.to);

  const [{ data: organizationData, error: organizationError }, { data: propertyData, error: propertyError }] = await Promise.all([
    supabase.from("organizations").select("id,name,commission_tier").neq("status", "ARCHIVED").order("name"),
    supabase.from("properties").select("id,organization_id,name,status").neq("status", "ARCHIVED").order("name"),
  ]);
  if (organizationError || propertyError) throw new Error("Unable to load report dimensions.");
  const organizations = (organizationData ?? []) as { id: string; name: string; commission_tier: string }[];
  const properties = (propertyData ?? []) as { id: string; organization_id: string; name: string; status: string }[];
  const organizationFilter = filters.organizationId && organizations.some((organization) => organization.id === filters.organizationId) ? filters.organizationId : null;
  const propertyFilter = filters.propertyId && properties.some((property) => property.id === filters.propertyId) ? filters.propertyId : null;

  let reservationQuery = supabase.from("reservations")
    .select("id,organization_id,property_id,confirmation_code,guest_name,status,payment_status,check_in,check_out,tax_total_cents,platform_commission_cents,currency,created_at")
    .eq("payment_environment", environment)
    .lte("check_in", range.to).gte("check_out", range.from)
    .order("check_in", { ascending: false }).limit(10000);
  if (organizationFilter) reservationQuery = reservationQuery.eq("organization_id", organizationFilter);
  if (propertyFilter) reservationQuery = reservationQuery.eq("property_id", propertyFilter);
  const { data: reservationData, error: reservationError } = await reservationQuery;
  if (reservationError) throw new Error("Unable to load admin reporting reservations.");
  const reservations = (reservationData ?? []) as ReservationRow[];
  const reservationIds = reservations.map((reservation) => reservation.id);

  const payments = reservationIds.length ? await loadChunks<PaymentRow>(reservationIds, async (ids) => {
    const result = await supabase.from("payments").select("id,reservation_id,status,amount_cents,platform_tax_retained_cents,processor_fee_host_share_cents,processor_fee_actual_cents,host_proceeds_cents,currency,created_at").in("reservation_id", ids).eq("payment_environment", environment).order("created_at", { ascending: false });
    return { data: (result.data ?? []) as PaymentRow[], error: result.error };
  }) : [];
  const refunds = reservationIds.length ? await loadChunks<RefundRow>(reservationIds, async (ids) => {
    const result = await supabase.from("refunds").select("reservation_id,status,amount_cents,currency,created_at").in("reservation_id", ids).eq("payment_environment", environment).eq("status", "SUCCEEDED");
    return { data: (result.data ?? []) as RefundRow[], error: result.error };
  }) : [];
  const payouts = reservationIds.length ? await loadChunks<PayoutRow>(reservationIds, async (ids) => {
    const result = await supabase.from("reservation_payouts").select("reservation_id,status,amount_cents,currency,paid_at").in("reservation_id", ids).eq("payment_environment", environment);
    return { data: (result.data ?? []) as PayoutRow[], error: result.error };
  }) : [];
  const notifications = reservationIds.length ? await loadChunks<{ id: string; reservation_id: string; status: string }>(reservationIds, async (ids) => {
    const result = await supabase.from("notification_deliveries").select("id,reservation_id,status").in("reservation_id", ids).eq("status", "FAILED");
    return { data: (result.data ?? []) as { id: string; reservation_id: string; status: string }[], error: result.error };
  }) : [];

  const latestPayment = new Map<string, PaymentRow>();
  for (const payment of payments) if (!latestPayment.has(payment.reservation_id)) latestPayment.set(payment.reservation_id, payment);
  const refundByReservation = new Map<string, number>();
  for (const refund of refunds) refundByReservation.set(refund.reservation_id, (refundByReservation.get(refund.reservation_id) ?? 0) + Number(refund.amount_cents || 0));
  const payoutByReservation = new Map<string, PayoutRow>();
  for (const payout of payouts) payoutByReservation.set(payout.reservation_id, payout);
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

  const rows = reservations.map((reservation) => {
    const payment = latestPayment.get(reservation.id);
    const settled = payment && settledPaymentStatuses.has(payment.status);
    const payout = payoutByReservation.get(reservation.id);
    return {
      reservationId: reservation.id,
      confirmationCode: reservation.confirmation_code,
      guestName: reservation.guest_name || "Guest",
      organizationId: reservation.organization_id,
      organizationName: organizationById.get(reservation.organization_id)?.name || "Host organization",
      propertyId: reservation.property_id,
      propertyName: propertyById.get(reservation.property_id)?.name || "Property",
      checkIn: reservation.check_in, checkOut: reservation.check_out, status: reservation.status, paymentStatus: reservation.payment_status,
      guestPaidCents: settled ? Number(payment.amount_cents || 0) : 0,
      taxCents: settled ? Number(payment.platform_tax_retained_cents ?? reservation.tax_total_cents ?? 0) : 0,
      commissionCents: settled ? Number(reservation.platform_commission_cents || 0) : 0,
      processingCents: settled ? Number(payment.processor_fee_host_share_cents || 0) : 0,
      processorActualCents: settled ? Number(payment.processor_fee_actual_cents || 0) : 0,
      hostProceedsCents: settled ? Number(payment.host_proceeds_cents || 0) : 0,
      refundCents: refundByReservation.get(reservation.id) ?? 0,
      payoutCents: payout?.status === "PAID" ? Number(payout.amount_cents || 0) : 0,
      payoutStatus: payout?.status || "NOT_SCHEDULED",
      currency: payment?.currency || reservation.currency || "USD",
    };
  });

  const totals = rows.reduce((sum, row) => ({
    grossGuestCents: sum.grossGuestCents + row.guestPaidCents,
    taxCents: sum.taxCents + row.taxCents,
    commissionCents: sum.commissionCents + row.commissionCents,
    processingCents: sum.processingCents + row.processingCents,
    processorActualCents: sum.processorActualCents + row.processorActualCents,
    hostProceedsCents: sum.hostProceedsCents + row.hostProceedsCents,
    refundCents: sum.refundCents + row.refundCents,
    paidPayoutCents: sum.paidPayoutCents + row.payoutCents,
  }), { grossGuestCents: 0, taxCents: 0, commissionCents: 0, processingCents: 0, processorActualCents: 0, hostProceedsCents: 0, refundCents: 0, paidPayoutCents: 0 });

  function buildBreakdown(kind: "property" | "organization") {
    const map = new Map<string, Breakdown>();
    for (const row of rows) {
      const id = kind === "property" ? row.propertyId : row.organizationId;
      const name = kind === "property" ? row.propertyName : row.organizationName;
      const bucket = map.get(id) ?? { id, name, reservations: 0, confirmedStays: 0, cancelledStays: 0, bookedNights: 0, grossGuestCents: 0, taxCents: 0, commissionCents: 0, processingCents: 0, hostProceedsCents: 0, refundCents: 0, paidPayoutCents: 0 };
      bucket.reservations += 1;
      if (row.status === "CONFIRMED") { bucket.confirmedStays += 1; bucket.bookedNights += stayNights(row.checkIn, row.checkOut); }
      if (row.status === "CANCELLED") bucket.cancelledStays += 1;
      bucket.grossGuestCents += row.guestPaidCents; bucket.taxCents += row.taxCents; bucket.commissionCents += row.commissionCents;
      bucket.processingCents += row.processingCents; bucket.hostProceedsCents += row.hostProceedsCents; bucket.refundCents += row.refundCents; bucket.paidPayoutCents += row.payoutCents;
      map.set(id, bucket);
    }
    return [...map.values()].sort((a, b) => b.grossGuestCents - a.grossGuestCents);
  }

  return {
    context, environment, range, organizations, properties, organizationFilter, propertyFilter,
    totals: {
      ...totals,
      reservations: rows.length,
      confirmedStays: rows.filter((row) => row.status === "CONFIRMED").length,
      cancelledStays: rows.filter((row) => row.status === "CANCELLED").length,
      bookedNights: rows.filter((row) => row.status === "CONFIRMED").reduce((sum, row) => sum + stayNights(row.checkIn, row.checkOut), 0),
      disputes: rows.filter((row) => row.paymentStatus === "DISPUTED").length,
      failedPayouts: payouts.filter((payout) => payout.status === "FAILED").length,
      failedNotifications: notifications.length,
      successfulRefunds: refunds.length,
    },
    organizationBreakdown: buildBreakdown("organization"),
    propertyBreakdown: buildBreakdown("property"),
    rows,
  };
}
