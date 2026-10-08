import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  nightsBetween,
  recoveryDatesAvailable,
} from "@/lib/bookings/recovery";
import { sendRecoveryDiscountOfferEmail } from "@/lib/notifications/booking-recovery";
import { siteUrl } from "@/lib/notifications/transactional-email";

type OpportunityRow = {
  id: string;
  organization_id: string;
  property_id: string;
  unit_id: string;
  check_in: string;
  check_out: string;
  status: string;
  first_interest_at: string;
  last_interest_at: string;
};

type SuppressionRow = { recipient_email: string; opted_out_at: string | null };
type ExpiredRecipientRow = { promotion_code_id: string };

type SourceReservation = {
  id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_count: number;
  pricing_snapshot: Record<string, unknown> | null;
  created_at: string;
};

function percentLabel(bps: number) {
  return Math.round(bps / 100);
}

function checkoutUrl(input: {
  slug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const query = new URLSearchParams({
    stay: input.slug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: String(Math.max(1, input.guests || 1)),
  });
  return `/checkout?${query.toString()}`;
}

async function createUniqueRecoveryPromotion(input: {
  admin: SupabaseClient;
  opportunity: OpportunityRow;
  reservation: SourceReservation;
  discountBps: number;
  createdBy: string;
}) {
  let quote = input.reservation.pricing_snapshot ?? {};
  let lodging = Number(
    quote.lodging_subtotal_before_discount_cents ??
      quote.lodging_subtotal_cents ??
      0,
  );

  // Prefer the price the guest actually saw. For older/legacy abandoned
  // records without a usable pricing snapshot, fall back to a current quote.
  if (!Number.isFinite(lodging) || lodging <= 0) {
    const { data: estimate, error: estimateError } = await input.admin.rpc(
      "quote_guest_checkout_estimate",
      {
        target_unit_id: input.opportunity.unit_id,
        check_in_date: input.opportunity.check_in,
        check_out_date: input.opportunity.check_out,
        guest_count: Math.max(1, Number(input.reservation.guest_count || 1)),
        pet_count: 0,
        selected_add_on_ids: [],
        promotion_code: null,
      },
    );

    if (estimateError || !estimate) {
      throw new Error(
        `Unable to price recovery offer: ${estimateError?.message ?? "Quote unavailable"}`,
      );
    }

    quote = (estimate as { quote?: Record<string, unknown> }).quote ?? {};
    lodging = Number(
      quote.lodging_subtotal_before_discount_cents ??
        quote.lodging_subtotal_cents ??
        0,
    );
  }
  const discountCents = Math.max(
    1,
    Math.round((lodging * input.discountBps) / 10000),
  );

  if (!Number.isFinite(lodging) || lodging <= 0 || discountCents <= 0) {
    throw new Error("Unable to calculate a recovery discount for this stay.");
  }

  const nights = nightsBetween(
    input.opportunity.check_in,
    input.opportunity.check_out,
  );
  if (nights < 1) throw new Error("Recovery stay dates are invalid.");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = `BACK${randomUUID().replaceAll("-", "").slice(0, 12)}`.toUpperCase();
    const { data: created, error } = await input.admin
      .from("promotion_codes")
      .insert({
        organization_id: input.opportunity.organization_id,
        unit_id: input.opportunity.unit_id,
        code,
        label: `Booking recovery ${percentLabel(input.discountBps)}% offer`,
        discount_type: "FIXED",
        percent_bps: null,
        amount_cents: discountCents,
        currency: "USD",
        eligible_check_in_start: input.opportunity.check_in,
        eligible_check_in_end: input.opportunity.check_in,
        minimum_nights: nights,
        minimum_lodging_cents: null,
        max_redemptions: 1,
        redemption_count: 0,
        is_active: true,
        allow_with_public_special: true,
        created_by: input.createdBy,
      })
      .select("id,code")
      .single();

    if (!error && created) {
      return {
        promotionId: created.id as string,
        code: created.code as string,
        discountCents,
      };
    }

    if (error?.code !== "23505") {
      throw new Error(`Unable to create recovery promotion: ${error?.message ?? "Unknown error"}`);
    }
  }

  throw new Error("Unable to create a unique recovery promotion code.");
}

export async function activateRecoveryOpportunity(input: {
  admin: SupabaseClient;
  opportunityId: string;
  discountBps: number;
  createdBy: string;
}) {
  const discountBps = Math.max(100, Math.min(5000, Math.round(input.discountBps)));

  const { data: opportunityData, error: opportunityError } = await input.admin
    .from("booking_recovery_opportunities")
    .select(
      "id,organization_id,property_id,unit_id,check_in,check_out,status,first_interest_at,last_interest_at",
    )
    .eq("id", input.opportunityId)
    .maybeSingle();

  if (opportunityError || !opportunityData) {
    throw new Error("Recovery opportunity was not found.");
  }

  const opportunity = opportunityData as OpportunityRow;
  if (!["OPEN", "SENT"].includes(opportunity.status)) {
    throw new Error("This recovery opportunity is no longer open.");
  }

  if (!(await recoveryDatesAvailable(
    input.admin,
    opportunity.unit_id,
    opportunity.check_in,
    opportunity.check_out,
  ))) {
    await input.admin
      .from("booking_recovery_opportunities")
      .update({ status: "EXPIRED" })
      .eq("id", opportunity.id)
      .in("status", ["OPEN", "SENT"]);
    throw new Error("Those dates are no longer available, so no offer was sent.");
  }

  const { data: property } = await input.admin
    .from("properties")
    .select("name")
    .eq("id", opportunity.property_id)
    .single();

  const { data: unit } = await input.admin
    .from("property_units")
    .select("slug")
    .eq("id", opportunity.unit_id)
    .single();

  if (!unit?.slug) throw new Error("Recovery stay is no longer bookable.");

  const startBound = new Date(
    new Date(opportunity.first_interest_at).getTime() - 12 * 60 * 60 * 1000,
  ).toISOString();
  const endBound = new Date(
    new Date(opportunity.last_interest_at).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: reservationRows, error: reservationError } = await input.admin
    .from("reservations")
    .select("id,guest_name,guest_email,guest_count,pricing_snapshot,created_at,status,payment_status")
    .eq("unit_id", opportunity.unit_id)
    .eq("check_in", opportunity.check_in)
    .eq("check_out", opportunity.check_out)
    .not("guest_email", "is", null)
    .eq("payment_environment", "LIVE")
    .gte("created_at", startBound)
    .lte("created_at", endBound)
    .in("status", ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"])
    .order("created_at", { ascending: false });

  if (reservationError) {
    throw new Error(`Unable to load recoverable guests: ${reservationError.message}`);
  }

  const byEmail = new Map<string, SourceReservation>();
  for (const row of reservationRows ?? []) {
    if (row.payment_status === "SUCCEEDED" || row.payment_status === "PROCESSING") continue;
    const email = row.guest_email?.trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      id: row.id,
      guest_name: row.guest_name,
      guest_email: email,
      guest_count: Number(row.guest_count || 1),
      pricing_snapshot:
        row.pricing_snapshot && typeof row.pricing_snapshot === "object"
          ? (row.pricing_snapshot as Record<string, unknown>)
          : null,
      created_at: row.created_at,
    });
  }

  if (!byEmail.size) {
    throw new Error("No recoverable guest emails are available for these dates.");
  }

  const emails = [...byEmail.keys()];
  const { data: suppressedRows } = await input.admin
    .from("booking_recovery_suppressions")
    .select("recipient_email,opted_out_at")
    .in("recipient_email", emails);
  const suppressed = new Set(
    ((suppressedRows ?? []) as SuppressionRow[])
      .filter((row) => Boolean(row.opted_out_at))
      .map((row) => row.recipient_email),
  );

  const { data: settings } = await input.admin
    .from("booking_recovery_settings")
    .select("offer_expiry_hours")
    .eq("property_id", opportunity.property_id)
    .maybeSingle();
  const expiryHours = Math.max(12, Math.min(168, Number(settings?.offer_expiry_hours || 48)));
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const [email, reservation] of byEmail) {
    if (suppressed.has(email)) {
      skipped += 1;
      continue;
    }

    try {
      let { data: recipient } = await input.admin
        .from("booking_recovery_offer_recipients")
        .select(
          "id,source_reservation_id,promotion_code_id,access_token,discount_bps,discount_cents,sent_at,expires_at",
        )
        .eq("opportunity_id", opportunity.id)
        .eq("recipient_email", email)
        .maybeSingle();

      if (!recipient) {
        const promotion = await createUniqueRecoveryPromotion({
          admin: input.admin,
          opportunity,
          reservation,
          discountBps,
          createdBy: input.createdBy,
        });

        const { data: createdRecipient, error: recipientError } = await input.admin
          .from("booking_recovery_offer_recipients")
          .insert({
            opportunity_id: opportunity.id,
            source_reservation_id: reservation.id,
            recipient_email: email,
            promotion_code_id: promotion.promotionId,
            discount_bps: discountBps,
            discount_cents: promotion.discountCents,
            expires_at: expiresAt,
          })
          .select(
            "id,source_reservation_id,promotion_code_id,access_token,discount_bps,discount_cents,sent_at,expires_at",
          )
          .single();

        if (recipientError || !createdRecipient) {
          await input.admin
            .from("promotion_codes")
            .update({ is_active: false, archived_at: new Date().toISOString() })
            .eq("id", promotion.promotionId);
          throw new Error(recipientError?.message || "Unable to create recovery recipient.");
        }
        recipient = createdRecipient;
      }

      const offer = new URL("/booking/recovery-offer", siteUrl());
      offer.searchParams.set("token", recipient.access_token);

      await sendRecoveryDiscountOfferEmail({
        admin: input.admin,
        reservationId: recipient.source_reservation_id,
        opportunityId: opportunity.id,
        recipient: email,
        guestName: reservation.guest_name,
        propertyName: property?.name || "your stay",
        checkIn: opportunity.check_in,
        checkOut: opportunity.check_out,
        discountBps: Number(recipient.discount_bps),
        discountCents: Number(recipient.discount_cents),
        offerUrl: offer.toString(),
      });

      const { data: delivery } = await input.admin
        .from("notification_deliveries")
        .select("status,sent_at")
        .eq("reservation_id", recipient.source_reservation_id)
        .eq("notification_type", `BOOKING_RECOVERY_OFFER:${opportunity.id}`)
        .eq("recipient", email)
        .maybeSingle();

      if (delivery?.status === "SENT") {
        await input.admin
          .from("booking_recovery_offer_recipients")
          .update({ sent_at: delivery.sent_at || new Date().toISOString() })
          .eq("id", recipient.id);
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("[booking recovery offer] recipient failed", {
        opportunityId: opportunity.id,
        recipient: email,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  if (sent > 0 && failed === 0) {
    await input.admin
      .from("booking_recovery_opportunities")
      .update({
        status: "SENT",
        suggested_discount_bps: discountBps,
        offered_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .eq("id", opportunity.id)
      .in("status", ["OPEN", "SENT"]);
  } else if (sent === 0 && failed === 0 && skipped >= byEmail.size) {
    await input.admin
      .from("booking_recovery_opportunities")
      .update({ status: "EXPIRED" })
      .eq("id", opportunity.id)
      .eq("status", "OPEN");
  }

  return { sent, skipped, failed, recipientCount: byEmail.size };
}

export async function cleanupExpiredRecoveryOffers(admin: SupabaseClient) {
  const now = new Date().toISOString();
  const { data: expiredRecipients, error } = await admin
    .from("booking_recovery_offer_recipients")
    .select("promotion_code_id")
    .lte("expires_at", now)
    .limit(1000);

  if (error) throw new Error(`Unable to inspect expired recovery offers: ${error.message}`);

  const promotionIds = [
    ...new Set(
      ((expiredRecipients ?? []) as ExpiredRecipientRow[]).map(
        (row) => row.promotion_code_id,
      ),
    ),
  ];
  if (promotionIds.length) {
    await admin
      .from("promotion_codes")
      .update({ is_active: false, archived_at: now })
      .in("id", promotionIds)
      .eq("is_active", true);
  }

  const { error: opportunityError } = await admin
    .from("booking_recovery_opportunities")
    .update({ status: "EXPIRED" })
    .eq("status", "SENT")
    .lte("expires_at", now);

  if (opportunityError) {
    throw new Error(`Unable to expire recovery opportunities: ${opportunityError.message}`);
  }

  return promotionIds.length;
}

export async function getRecoveryOfferByToken(
  admin: SupabaseClient,
  token: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;

  const { data: recipient, error } = await admin
    .from("booking_recovery_offer_recipients")
    .select(
      "id,opportunity_id,source_reservation_id,promotion_code_id,recipient_email,discount_bps,discount_cents,expires_at,sent_at",
    )
    .eq("access_token", token)
    .maybeSingle();

  if (error || !recipient || !recipient.sent_at) return null;
  if (new Date(recipient.expires_at).getTime() <= Date.now()) return null;

  const [{ data: opportunity }, { data: promotion }, { data: reservation }] = await Promise.all([
    admin
      .from("booking_recovery_opportunities")
      .select("unit_id,property_id,check_in,check_out,status")
      .eq("id", recipient.opportunity_id)
      .maybeSingle(),
    admin
      .from("promotion_codes")
      .select("code,is_active,archived_at,max_redemptions,redemption_count")
      .eq("id", recipient.promotion_code_id)
      .maybeSingle(),
    admin
      .from("reservations")
      .select("guest_count,status,payment_status")
      .eq("id", recipient.source_reservation_id)
      .maybeSingle(),
  ]);

  if (
    !opportunity ||
    !["SENT", "OPEN"].includes(opportunity.status) ||
    !promotion?.is_active ||
    promotion.archived_at ||
    (promotion.max_redemptions != null &&
      Number(promotion.redemption_count || 0) >= Number(promotion.max_redemptions)) ||
    !reservation ||
    reservation.status === "CONFIRMED" ||
    reservation.payment_status === "SUCCEEDED"
  ) {
    return null;
  }

  const [{ data: unit }, { data: property }] = await Promise.all([
    admin
      .from("property_units")
      .select("slug,is_active")
      .eq("id", opportunity.unit_id)
      .maybeSingle(),
    admin
      .from("properties")
      .select("name,status")
      .eq("id", opportunity.property_id)
      .maybeSingle(),
  ]);

  if (!unit?.slug || !unit.is_active || property?.status !== "PUBLISHED") return null;

  const available = await recoveryDatesAvailable(
    admin,
    opportunity.unit_id,
    opportunity.check_in,
    opportunity.check_out,
  );

  return {
    id: recipient.id as string,
    propertyName: property.name as string,
    slug: unit.slug as string,
    checkIn: opportunity.check_in as string,
    checkOut: opportunity.check_out as string,
    guests: Math.max(1, Number(reservation.guest_count || 1)),
    discountBps: Number(recipient.discount_bps),
    discountCents: Number(recipient.discount_cents),
    promotionCode: promotion.code as string,
    expiresAt: recipient.expires_at as string,
    available,
    checkoutHref: checkoutUrl({
      slug: unit.slug,
      checkIn: opportunity.check_in,
      checkOut: opportunity.check_out,
      guests: Number(reservation.guest_count || 1),
    }),
  };
}
