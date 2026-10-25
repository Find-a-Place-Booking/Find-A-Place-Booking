import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recoveryDatesAvailable, nightsBetween, ensureRecoverySuppression } from "@/lib/bookings/recovery";
import { sendRecoveryDiscountOfferEmail } from "@/lib/notifications/booking-recovery";
import { siteUrl } from "@/lib/notifications/transactional-email";

const RECOVERABLE = new Set(["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"]);
const DISCOUNTS = new Set([5, 10, 15, 20]);
const OFFER_HOURS = 48;

export type ManualOfferReservation = {
  id: string;
  property_id: string;
  organization_id: string;
  unit_id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_count: number;
  guest_total_cents: number;
  pricing_snapshot: Record<string, unknown> | null;
  currency: string;
  check_in: string;
  check_out: string;
  payment_environment: string;
  status: string;
  payment_status: string;
  created_at: string;
};

type OfferContext = {
  reservation: ManualOfferReservation;
  propertyName: string;
  lodgingCents: number;
  existingSent: boolean;
  reason: string | null;
};

function originalLodgingCents(snapshot: Record<string, unknown> | null): number {
  const value = snapshot?.lodging_subtotal_before_discount_cents ?? snapshot?.lodging_subtotal_cents;
  const cents = Number(value);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}

export function manualOfferSavings(lodgingCents: number, percent: number): number {
  if (!DISCOUNTS.has(percent) || !Number.isSafeInteger(lodgingCents) || lodgingCents <= 0) {
    throw new Error("Choose a valid discount and lodging price.");
  }
  return Math.max(1, Math.round(lodgingCents * percent / 100));
}

export async function loadManualOfferContext(input: {
  admin: SupabaseClient;
  userClient: SupabaseClient;
  reservationId: string;
  environment: string;
}): Promise<OfferContext> {
  const { data, error } = await input.admin
    .from("reservations")
    .select("id,property_id,organization_id,unit_id,guest_name,guest_email,guest_count,guest_total_cents,pricing_snapshot,currency,check_in,check_out,payment_environment,status,payment_status,created_at")
    .eq("id", input.reservationId)
    .maybeSingle();

  if (error || !data) throw new Error("Reservation not found.");
  const reservation = data as ManualOfferReservation;

  // Authorization is based on the signed-in user's property-management RLS
  // function, NOT on their access to the general admin reservations table.
  const { data: canManage, error: canManageError } = await input.userClient.rpc(
    "can_manage_property", { target_property_id: reservation.property_id },
  );
  if (canManageError || canManage !== true) {
    throw new Error("You cannot send offers for this host's property.");
  }

  const { data: property, error: propertyError } = await input.admin
    .from("properties")
    .select("name,status,organization_id")
    .eq("id", reservation.property_id)
    .maybeSingle();
  if (propertyError || !property || property.organization_id !== reservation.organization_id) {
    throw new Error("Property ownership could not be confirmed.");
  }
  const lodgingCents = originalLodgingCents(reservation.pricing_snapshot);
  let reason: string | null = null;
  if (input.environment !== "LIVE" || reservation.payment_environment !== "LIVE") {
    reason = "Offers can only be sent from the live booking environment.";
  } else if (!RECOVERABLE.has(reservation.status) || ["SUCCEEDED", "PROCESSING", "REFUNDED", "DISPUTED"].includes(reservation.payment_status)) {
    reason = "This reservation is no longer an unfinished, unpaid checkout.";
  } else if (!reservation.guest_email?.trim()) {
    reason = "This checkout has no guest email address.";
  } else if (reservation.check_in <= new Date().toISOString().slice(0, 10)) {
    reason = "The requested check-in date has passed.";
  } else if (property.status !== "PUBLISHED") {
    reason = "This property is no longer published.";
  } else if (reservation.currency !== "USD" || lodgingCents <= 0) {
    reason = "The original lodging amount is unavailable for a safe discount quote.";
  }

  const { data: setting, error: settingError } = await input.admin
    .from("booking_recovery_settings")
    .select("is_enabled,offer_mode")
    .eq("property_id", reservation.property_id)
    .maybeSingle();
  if (settingError) throw new Error("Unable to verify booking-recovery settings.");
  if (!reason && (!setting?.is_enabled || setting.offer_mode === "OFF")) {
    reason = "Recovery offers are off for this property. The owner can enable them in Booking recovery.";
  }

  const { data: sameStayRecords, error: sameStayError } = await input.admin
    .from("reservations")
    .select("id,status,payment_status,guest_email")
    .eq("unit_id", reservation.unit_id)
    .eq("check_in", reservation.check_in)
    .eq("check_out", reservation.check_out)
    .eq("payment_environment", "LIVE")
    .ilike("guest_email", reservation.guest_email?.trim() || "__none__")
    .limit(100);
  if (sameStayError) throw new Error("Unable to inspect related checkout attempts.");
  if (!reason && (sameStayRecords ?? []).some((row) =>
    row.status === "CONFIRMED" || ["SUCCEEDED", "PROCESSING"].includes(row.payment_status),
  )) {
    reason = "This guest already has a completed or processing booking for these dates.";
  }

  // Check the unique unit/date opportunity; this also catches the guest's
  // earlier attempt if they generated multiple checkout records.
  const { data: opportunity, error: opportunityError } = await input.admin
    .from("booking_recovery_opportunities")
    .select("id,status")
    .eq("unit_id", reservation.unit_id)
    .eq("check_in", reservation.check_in)
    .eq("check_out", reservation.check_out)
    .maybeSingle();
  if (opportunityError) throw new Error("Unable to check existing special offers.");
  let existingSent = false;
  if (opportunity) {
    if (["DECLINED", "EXPIRED"].includes(opportunity.status) && !reason) {
      reason = "This date-range campaign is closed. No duplicate offer will be sent.";
    }
    const { data: earlier, error: earlierError } = await input.admin
      .from("booking_recovery_offer_recipients")
      .select("id,sent_at")
      .eq("opportunity_id", opportunity.id)
      .ilike("recipient_email", reservation.guest_email?.trim() || "__none__")
      .maybeSingle();
    if (earlierError) throw new Error("Unable to inspect earlier offer delivery.");
    if (earlier?.sent_at) {
      existingSent = true;
      reason = "A special offer was already sent to this guest for these dates.";
    }
  }

  if (!reason && reservation.guest_email) {
    const { data: preference, error: preferenceError } = await input.admin
      .from("booking_recovery_suppressions")
      .select("opted_out_at")
      .eq("recipient_email", reservation.guest_email.trim().toLowerCase())
      .maybeSingle();
    if (preferenceError) throw new Error("Unable to check email preferences.");
    if (preference?.opted_out_at) reason = "This guest opted out of booking-recovery emails.";
  }

  if (!reason && !(await recoveryDatesAvailable(
    input.admin, reservation.unit_id, reservation.check_in, reservation.check_out,
  ))) {
    reason = "These dates are no longer confirmed available. No offer can be sent.";
  }

  return { reservation, propertyName: property.name, lodgingCents, existingSent, reason };
}

export async function sendManualTargetedOffer(input: {
  admin: SupabaseClient;
  userClient: SupabaseClient;
  reservationId: string;
  createdBy: string;
  discountPercent: number;
  environment: string;
}) {
  if (!DISCOUNTS.has(input.discountPercent)) throw new Error("Choose 5%, 10%, 15% or 20%.");
  const ctx = await loadManualOfferContext(input);
  if (ctx.reason) throw new Error(ctx.reason);
  const r = ctx.reservation;
  const email = r.guest_email!.trim().toLowerCase();
  const preference = await ensureRecoverySuppression(input.admin, email);
  if (!preference || preference.opted_out_at) throw new Error("Guest opted out of recovery emails.");
  const discountCents = manualOfferSavings(ctx.lodgingCents, input.discountPercent);
  const discountBps = input.discountPercent * 100;
  const expiresAt = new Date(Date.now() + OFFER_HOURS * 3600_000).toISOString();
  const nights = nightsBetween(r.check_in, r.check_out);
  if (nights < 1) throw new Error("Invalid stay dates.");

  let { data: opportunity, error: opportunityError } = await input.admin
    .from("booking_recovery_opportunities")
    .select("id,status")
    .eq("unit_id", r.unit_id)
    .eq("check_in", r.check_in)
    .eq("check_out", r.check_out)
    .maybeSingle();
  if (opportunityError) throw new Error(opportunityError.message);

  if (!opportunity) {
    const created = await input.admin.from("booking_recovery_opportunities").insert({
      organization_id: r.organization_id,
      property_id: r.property_id,
      unit_id: r.unit_id,
      check_in: r.check_in,
      check_out: r.check_out,
      first_interest_at: r.created_at,
      last_interest_at: r.created_at,
      interest_count: 1,
      recoverable_count: 1,
      status: "OPEN",
      suggested_discount_bps: discountBps,
    }).select("id,status").maybeSingle();
    if (created.error && created.error.code !== "23505") throw new Error(created.error.message);
    if (created.data) opportunity = created.data;
    else {
      const raced = await input.admin.from("booking_recovery_opportunities")
        .select("id,status").eq("unit_id", r.unit_id).eq("check_in", r.check_in)
        .eq("check_out", r.check_out).single();
      if (raced.error) throw new Error(raced.error.message);
      opportunity = raced.data;
    }
  }
  if (!opportunity || !["OPEN", "SENT"].includes(opportunity.status)) {
    throw new Error("This date-range opportunity is closed.");
  }

  let { data: recipient, error: recipientError } = await input.admin
    .from("booking_recovery_offer_recipients")
    .select("id,source_reservation_id,access_token,discount_cents,discount_bps,expires_at,sent_at,promotion_code_id")
    .eq("opportunity_id", opportunity.id)
    .eq("recipient_email", email)
    .maybeSingle();
  if (recipientError) throw new Error(recipientError.message);
  if (recipient?.sent_at) throw new Error("This guest already received an offer for these dates.");
  if (recipient && new Date(recipient.expires_at).getTime() <= Date.now()) {
    throw new Error("An earlier offer for these dates expired. It will not be resent automatically.");
  }

  if (!recipient) {
    let promotionId = "";
    for (let i = 0; i < 4 && !promotionId; i++) {
      const code = `BACK${randomUUID().replaceAll("-", "").slice(0, 12)}`.toUpperCase();
      const result = await input.admin.from("promotion_codes").insert({
        organization_id: r.organization_id,
        unit_id: r.unit_id,
        code,
        label: `Manual recovery ${input.discountPercent}% offer`,
        discount_type: "FIXED",
        percent_bps: null,
        amount_cents: discountCents,
        currency: "USD",
        eligible_check_in_start: r.check_in,
        eligible_check_in_end: r.check_in,
        minimum_nights: nights,
        minimum_lodging_cents: null,
        max_redemptions: 1,
        redemption_count: 0,
        is_active: true,
        allow_with_public_special: true,
        created_by: input.createdBy,
      }).select("id").single();
      if (result.data) promotionId = result.data.id;
      else if (result.error?.code !== "23505") throw new Error(result.error?.message || "Unable to create the discount.");
    }
    if (!promotionId) throw new Error("Unable to generate a unique offer code.");
    const created = await input.admin.from("booking_recovery_offer_recipients").insert({
      opportunity_id: opportunity.id,
      source_reservation_id: r.id,
      recipient_email: email,
      promotion_code_id: promotionId,
      discount_bps: discountBps,
      discount_cents: discountCents,
      expires_at: expiresAt,
    }).select("id,source_reservation_id,access_token,discount_cents,discount_bps,expires_at,sent_at,promotion_code_id").maybeSingle();
    if (created.error || !created.data) {
      await input.admin.from("promotion_codes").update({
        is_active: false, archived_at: new Date().toISOString(),
      }).eq("id", promotionId);
      throw new Error(created.error?.code === "23505"
        ? "Another offer was prepared for this guest. Refresh before retrying."
        : created.error?.message || "Unable to prepare the offer.");
    }
    recipient = created.data;
  }

  // Email is persisted/idempotent for this specific reservation+opportunity.
  // If a previous attempt sent successfully but lost its recipient update,
  // reconcile from notification_deliveries before calling the provider again.
  const notificationType = `BOOKING_RECOVERY_OFFER:${opportunity.id}`;
  const { data: priorDelivery, error: deliveryError } = await input.admin
    .from("notification_deliveries")
    .select("status,sent_at")
    .eq("reservation_id", recipient.source_reservation_id)
    .eq("notification_type", notificationType)
    .eq("recipient", email)
    .maybeSingle();
  if (deliveryError) throw new Error("Unable to check previous offer email delivery.");
  if (priorDelivery?.status === "SENT") {
    await input.admin.from("booking_recovery_offer_recipients")
      .update({ sent_at: priorDelivery.sent_at || new Date().toISOString() })
      .eq("id", recipient.id);
    throw new Error("This guest already received an offer for these dates.");
  }
  if (!(await recoveryDatesAvailable(input.admin, r.unit_id, r.check_in, r.check_out))) {
    throw new Error("Dates became unavailable. The offer was not sent.");
  }

  const offerUrl = new URL("/booking/recovery-offer", siteUrl());
  offerUrl.searchParams.set("token", recipient.access_token);
  const result = await sendRecoveryDiscountOfferEmail({
    admin: input.admin,
    reservationId: recipient.source_reservation_id,
    opportunityId: opportunity.id,
    recipient: email,
    guestName: r.guest_name,
    propertyName: ctx.propertyName,
    checkIn: r.check_in,
    checkOut: r.check_out,
    discountBps: Number(recipient.discount_bps),
    discountCents: Number(recipient.discount_cents),
    offerUrl: offerUrl.toString(),
  });
  if (!result.sent) throw new Error("The email was not sent; check the email service before retrying.");

  const { data: sentDelivery, error: sentDeliveryError } = await input.admin
    .from("notification_deliveries").select("status,sent_at")
    .eq("reservation_id", recipient.source_reservation_id)
    .eq("notification_type", notificationType).eq("recipient", email).maybeSingle();
  if (sentDeliveryError || sentDelivery?.status !== "SENT") {
    throw new Error("Email delivery status needs reconciliation. Do not resend yet.");
  }
  const { error: markError } = await input.admin.from("booking_recovery_offer_recipients")
    .update({ sent_at: sentDelivery.sent_at || new Date().toISOString() })
    .eq("id", recipient.id);
  if (markError) throw new Error("Email sent, but recipient status needs reconciliation. Do not resend.");

  const { error: markOpportunityError } = await input.admin
    .from("booking_recovery_opportunities")
    .update({ status: "SENT", offered_at: new Date().toISOString(), expires_at: recipient.expires_at })
    .eq("id", opportunity.id).in("status", ["OPEN", "SENT"]);
  if (markOpportunityError) {
    console.error("[manual recovery offer] opportunity marking failed", markOpportunityError);
  }
  return { savedCents: Number(recipient.discount_cents), guest: r.guest_name || "Guest" };
}
