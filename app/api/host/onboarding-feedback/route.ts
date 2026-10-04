import { NextRequest, NextResponse } from "next/server";

import { sendHostOnboardingFeedbackEmail } from "@/lib/notifications/host-onboarding-feedback";
import { sameOrigin } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HELP_VALUES = new Set(["NO", "A_LITTLE", "YES_SEVERAL"]);
const SURFACES = new Set(["onboarding", "overview"]);

const ALLOWED_DIFFICULTY_AREAS = new Set([
  "Property details",
  "Location",
  "Amenities",
  "Photos",
  "Rates & fees",
  "Taxes",
  "Policies",
  "Calendar / availability",
  "Airbnb / Vrbo iCal",
  "ThinkReservations / ResNexus / PMS",
  "Stripe / payments",
  "Publishing",
  "Other",
]);

function cleanText(value: unknown, max = 5000) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

function score(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5
    ? number
    : null;
}

function difficultyAreas(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => ALLOWED_DIFFICULTY_AREAS.has(item)),
    ),
  ];
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const propertyId = cleanText(body.propertyId, 100);
    const slug = cleanText(body.slug, 160).toLowerCase();
    const surface = cleanText(body.surface, 40).toLowerCase();
    const overallEase = score(body.overallEase);
    const addPropertyConfidence = score(body.addPropertyConfidence);
    const humanHelp = cleanText(body.humanHelp, 40).toUpperCase();
    const dontGoEmptyInterest =
      typeof body.dontGoEmptyInterest === "boolean"
        ? body.dontGoEmptyInterest
        : null;

    if (!SURFACES.has(surface)) {
      return NextResponse.json(
        { error: "The feedback source is invalid." },
        { status: 400 },
      );
    }

    if (
      overallEase == null ||
      addPropertyConfidence == null ||
      !HELP_VALUES.has(humanHelp)
    ) {
      return NextResponse.json(
        {
          error:
            "Answer the three required quick rating questions before submitting.",
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const profileId = claims?.claims?.sub;

    if (!profileId) {
      return NextResponse.json(
        { error: "Sign in again before sending feedback." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    let unit:
      | { id: string; property_id: string; slug: string }
      | null = null;

    if (UUID_RE.test(propertyId)) {
      const { data: primaryUnit, error: unitError } = await admin
        .from("property_units")
        .select("id,property_id,slug")
        .eq("property_id", propertyId)
        .eq("is_primary", true)
        .maybeSingle();

      if (unitError) {
        throw new Error(
          `Unable to load the property unit: ${unitError.message}`,
        );
      }
      unit = primaryUnit;
    } else if (SLUG_RE.test(slug)) {
      const { data: slugUnit, error: unitError } = await admin
        .from("property_units")
        .select("id,property_id,slug")
        .eq("slug", slug)
        .maybeSingle();

      if (unitError) {
        throw new Error(
          `Unable to load the property unit: ${unitError.message}`,
        );
      }
      unit = slugUnit;
    }

    if (!unit?.property_id) {
      return NextResponse.json(
        { error: "We couldn't match this survey to your property." },
        { status: 404 },
      );
    }

    const { data: canAccess, error: accessError } = await supabase.rpc(
      "can_access_property",
      { target_property_id: unit.property_id },
    );

    if (accessError || canAccess !== true) {
      return NextResponse.json(
        { error: "You do not have access to submit feedback for this property." },
        { status: 403 },
      );
    }

    // The onboarding survey is once per host. If it was already completed from
    // either surface, do not create a second response or nag the host again.
    const { data: existing, error: existingError } = await admin
      .from("host_onboarding_feedback")
      .select("id,email_status")
      .eq("submitted_by", profileId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `Unable to inspect previous onboarding feedback: ${existingError.message}`,
      );
    }

    if (existing?.id) {
      if (existing.email_status !== "SENT") {
        try {
          await sendHostOnboardingFeedbackEmail(admin, existing.id);
        } catch (emailError) {
          console.error(
            "[host onboarding feedback] existing email retry failed",
            emailError,
          );
        }
      }

      return NextResponse.json({
        ok: true,
        saved: true,
        alreadySubmitted: true,
      });
    }

    const [propertyResult, profileResult, calendarResult, draftResult] =
      await Promise.all([
        admin
          .from("properties")
          .select("id,organization_id,name,status,calendar_preference")
          .eq("id", unit.property_id)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("full_name,email")
          .eq("id", profileId)
          .maybeSingle(),
        admin
          .from("calendar_connections")
          .select("provider,connection_kind,label,sync_status,is_active")
          .eq("unit_id", unit.id)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        admin
          .from("host_onboarding_drafts")
          .select("status,current_step,updated_at")
          .eq("created_property_id", unit.property_id)
          .maybeSingle(),
      ]);

    const property = propertyResult.data;
    if (propertyResult.error || !property) {
      return NextResponse.json(
        { error: "We couldn't load the property context for this survey." },
        { status: 409 },
      );
    }

    const [{ data: organization }, { data: stripeAccount }] =
      await Promise.all([
        admin
          .from("organizations")
          .select("name")
          .eq("id", property.organization_id)
          .maybeSingle(),
        admin
          .from("payment_accounts")
          .select("status,charges_enabled,payouts_enabled,environment")
          .eq("organization_id", property.organization_id)
          .eq("provider", "STRIPE")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const selectedDifficulties = difficultyAreas(body.difficultyAreas);
    const hardestPart = cleanText(body.hardestPart);
    const explainBetter = cleanText(body.explainBetter);
    const unnecessaryPart = cleanText(body.unnecessaryPart);
    const missingFeature = cleanText(body.missingFeature);
    const humanHelpDetails = cleanText(body.humanHelpDetails);
    const oneChange = cleanText(body.oneChange);
    const additionalComments = cleanText(body.additionalComments, 7000);

    const needsReview =
      overallEase <= 2 ||
      addPropertyConfidence <= 2 ||
      humanHelp === "YES_SEVERAL";

    const faqCandidate = Boolean(
      hardestPart || explainBetter || missingFeature || oneChange,
    );

    const calendarConnections = (calendarResult.data ?? []).map(
      (connection) =>
        [
          connection.label || connection.provider,
          connection.connection_kind,
          connection.sync_status,
        ]
          .filter(Boolean)
          .join(" · "),
    );

    const stripeStatus = stripeAccount
      ? [
          stripeAccount.status,
          stripeAccount.charges_enabled ? "charges enabled" : "charges off",
          stripeAccount.payouts_enabled ? "payouts enabled" : "payouts off",
          stripeAccount.environment,
        ]
          .filter(Boolean)
          .join(" · ")
      : "No Stripe account found";

    const { data: feedback, error: insertError } = await admin
      .from("host_onboarding_feedback")
      .insert({
        organization_id: property.organization_id,
        property_id: property.id,
        submitted_by: profileId,
        respondent_name: profileResult.data?.full_name || null,
        respondent_email: profileResult.data?.email || null,
        organization_name: organization?.name || null,
        property_name: property.name,
        property_slug: unit.slug,
        overall_ease: overallEase,
        difficulty_areas: selectedDifficulties,
        hardest_part: hardestPart || null,
        explain_better: explainBetter || null,
        unnecessary_part: unnecessaryPart || null,
        missing_feature: missingFeature || null,
        human_help: humanHelp,
        human_help_details: humanHelpDetails || null,
        add_property_confidence: addPropertyConfidence,
        one_change: oneChange || null,
        additional_comments: additionalComments || null,
        dont_go_empty_interest: dontGoEmptyInterest,
        needs_review: needsReview,
        faq_candidate: faqCandidate,
        context: {
          surface,
          property_status: property.status,
          calendar_preference: property.calendar_preference,
          calendar_connections: calendarConnections,
          stripe_status: stripeStatus,
          onboarding_status: draftResult.data?.status || "Not available",
          onboarding_step: draftResult.data?.current_step ?? null,
          onboarding_updated_at: draftResult.data?.updated_at || null,
        },
      })
      .select("id")
      .single();

    if (insertError || !feedback?.id) {
      console.error(
        "[host onboarding feedback] save failed",
        insertError,
      );
      return NextResponse.json(
        {
          error:
            "We couldn't save the feedback right now. Your listing is still safe.",
        },
        { status: 500 },
      );
    }

    let emailSent = false;
    try {
      const result = await sendHostOnboardingFeedbackEmail(
        admin,
        feedback.id,
      );
      emailSent = result.sent;
    } catch (emailError) {
      // The row is already saved. The existing notification cron retries failed
      // feedback email delivery, so email provider trouble never blocks the host.
      console.error(
        "[host onboarding feedback] initial email failed; cron will retry",
        emailError,
      );
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      emailSent,
    });
  } catch (error) {
    console.error("[host onboarding feedback]", error);
    return NextResponse.json(
      {
        error:
          "Unable to save onboarding feedback right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
