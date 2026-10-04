"use server";

import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/auth/paths";
import { sendHostOnboardingFeedbackEmail } from "@/lib/notifications/host-onboarding-feedback";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

const ALLOWED_HUMAN_HELP = new Set([
  "NO",
  "A_LITTLE",
  "YES_SEVERAL",
]);

function value(formData: FormData, key: string, max = 4000) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function score(formData: FormData, key: string) {
  const parsed = Number.parseInt(value(formData, key, 4), 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5
    ? parsed
    : null;
}

function withFeedbackState(
  returnTo: string,
  state: "submitted" | "error",
  message?: string,
) {
  const url = new URL(returnTo, "https://findaplacebooking.local");
  url.searchParams.set("feedback", state);
  if (message) {
    url.searchParams.set("feedback_error", message.slice(0, 220));
  } else {
    url.searchParams.delete("feedback_error");
  }
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export async function submitHostOnboardingFeedback(
  formData: FormData,
) {
  const slug = value(formData, "slug", 160).toLowerCase();
  const fallback = SLUG_RE.test(slug)
    ? `/host/properties/${encodeURIComponent(slug)}?onboarding=complete`
    : "/host/properties";
  const returnTo = safeInternalPath(
    formData.get("returnTo"),
    fallback,
  );

  if (!SLUG_RE.test(slug)) {
    redirect(
      withFeedbackState(
        returnTo,
        "error",
        "The property reference is invalid. Your listing is still safe.",
      ),
    );
  }

  const overallEase = score(formData, "overallEase");
  const addPropertyConfidence = score(
    formData,
    "addPropertyConfidence",
  );
  const humanHelp = value(formData, "humanHelp", 40).toUpperCase();

  if (
    overallEase == null ||
    addPropertyConfidence == null ||
    !ALLOWED_HUMAN_HELP.has(humanHelp)
  ) {
    redirect(
      withFeedbackState(
        returnTo,
        "error",
        "Answer the three required rating questions, or choose Maybe later.",
      ),
    );
  }

  const difficultyAreas = [
    ...new Set(
      formData
        .getAll("difficultyAreas")
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => ALLOWED_DIFFICULTY_AREAS.has(entry)),
    ),
  ];

  const hardestPart = value(formData, "hardestPart", 5000);
  const explainBetter = value(formData, "explainBetter", 5000);
  const unnecessaryPart = value(formData, "unnecessaryPart", 5000);
  const missingFeature = value(formData, "missingFeature", 5000);
  const humanHelpDetails = value(formData, "humanHelpDetails", 5000);
  const oneChange = value(formData, "oneChange", 5000);
  const additionalComments = value(
    formData,
    "additionalComments",
    7000,
  );

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  if (!profileId) {
    redirect(
      `/host/sign-in?next=${encodeURIComponent(returnTo)}`,
    );
  }

  const { data: unit, error: unitError } = await supabase
    .from("property_units")
    .select("id,property_id,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (unitError || !unit?.property_id) {
    redirect(
      withFeedbackState(
        returnTo,
        "error",
        "We couldn't match the survey to this property. Your listing is still safe.",
      ),
    );
  }

  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_property",
    { target_property_id: unit.property_id },
  );

  if (accessError || canAccess !== true) {
    redirect(
      withFeedbackState(
        returnTo,
        "error",
        "You don't have access to submit feedback for this property.",
      ),
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("host_onboarding_feedback")
    .select("id,email_status")
    .eq("property_id", unit.property_id)
    .eq("submitted_by", profileId)
    .maybeSingle();

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

    redirect(withFeedbackState(returnTo, "submitted"));
  }

  const [
    propertyResult,
    profileResult,
    calendarResult,
    draftResult,
  ] = await Promise.all([
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
    redirect(
      withFeedbackState(
        returnTo,
        "error",
        "We couldn't load the property context for this survey. Your listing is still safe.",
      ),
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

  const needsReview =
    overallEase <= 2 ||
    addPropertyConfidence <= 2 ||
    humanHelp === "YES_SEVERAL";

  const faqCandidate = Boolean(
    hardestPart || explainBetter || missingFeature || oneChange,
  );

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
      difficulty_areas: difficultyAreas,
      hardest_part: hardestPart || null,
      explain_better: explainBetter || null,
      unnecessary_part: unnecessaryPart || null,
      missing_feature: missingFeature || null,
      human_help: humanHelp,
      human_help_details: humanHelpDetails || null,
      add_property_confidence: addPropertyConfidence,
      one_change: oneChange || null,
      additional_comments: additionalComments || null,
      needs_review: needsReview,
      faq_candidate: faqCandidate,
      context: {
        surface: "post_onboarding_property",
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
    redirect(
      withFeedbackState(
        returnTo,
        "error",
        "We couldn't save the feedback. Your property setup is complete; you can skip this and continue.",
      ),
    );
  }

  // The database row is the source of truth. Email failure never blocks the host.
  try {
    await sendHostOnboardingFeedbackEmail(admin, feedback.id);
  } catch (emailError) {
    console.error(
      "[host onboarding feedback] initial email failed; cron will retry",
      emailError,
    );
  }

  redirect(withFeedbackState(returnTo, "submitted"));
}
