import { redirect } from "next/navigation";

import { getCurrentPolicyVersions } from "@/lib/policies/current";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createClient } from "@/lib/supabase/server";

export type HostOnboardingRecord = {
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  partnerStatus: string;
  commissionTier: string;
  currentStep: number;
  onboardingStatus: string;
  formData: Record<string, string>;
  amenities: string[];
  policies: string[];
  photoNames: string[];
  authorityConfirmed: boolean;
  policyAccepted: boolean;
  policyAcceptedAt: string | null;
  stripeReady: boolean;
  calendarConfigured: boolean;
  calendarReady: boolean;
  currentPolicyVersions: {
    hostAgreement: string;
    cancellationPolicy: string;
    privacyNotice: string;
  };
  savedAt: string | null;
};

type CalendarConnectionRow = {
  connection_kind: "ICAL" | "PMS_API" | "BROWSER_WORKER";
  sync_status: string;
  last_success_at: string | null;
  is_active: boolean;
};

function normalizedCalendarPreference(value: unknown) {
  const normalized = String(value ?? "UNSET").trim().toUpperCase();
  return ["ICAL", "PMS", "NONE"].includes(normalized)
    ? normalized
    : "UNSET";
}

function calendarStatus(
  preference: string,
  connections: CalendarConnectionRow[],
) {
  if (preference === "NONE") {
    return { configured: true, ready: true };
  }

  const relevant = connections.filter((connection) => {
    if (!connection.is_active) return false;
    if (preference === "ICAL") {
      return connection.connection_kind === "ICAL";
    }
    if (preference === "PMS") {
      return ["PMS_API", "BROWSER_WORKER"].includes(
        connection.connection_kind,
      );
    }
    return false;
  });

  return {
    configured: relevant.length > 0,
    ready: relevant.some(
      (connection) =>
        connection.sync_status === "HEALTHY" &&
        Boolean(connection.last_success_at),
    ),
  };
}

export async function getHostOnboarding(): Promise<HostOnboardingRecord> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  if (!profileId) {
    redirect("/host/sign-in?next=/host/onboarding");
  }

  const { data: organizationId, error: ensureError } =
    await supabase.rpc("ensure_host_onboarding");

  if (ensureError || !organizationId) {
    throw new Error("Unable to initialize host onboarding.");
  }

  const environment = stripeEnvironment();

  const [
    { data: organization, error: organizationError },
    { data: draft, error: draftError },
    { data: stripeAccount },
    currentVersions,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id,name,status,partner_status,commission_tier,primary_contact_name,business_location,contact_email,contact_phone",
      )
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("host_onboarding_drafts")
      .select(
        "current_step,status,form_data,amenities,policies,photo_names,authority_confirmed,created_property_id,host_policy_accepted_at,host_agreement_version,cancellation_policy_version,privacy_notice_version,updated_at",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("payment_accounts")
      .select("status,charges_enabled,payouts_enabled")
      .eq("organization_id", organizationId)
      .eq("provider", "STRIPE")
      .eq("environment", environment)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCurrentPolicyVersions(supabase),
  ]);

  if (
    organizationError ||
    !organization ||
    draftError ||
    !draft
  ) {
    throw new Error("Unable to load host onboarding.");
  }

  const storedForm =
    draft.form_data &&
    typeof draft.form_data === "object" &&
    !Array.isArray(draft.form_data)
      ? (draft.form_data as Record<string, string>)
      : {};

  let propertyCalendarPreference = "UNSET";
  let calendarConnections: CalendarConnectionRow[] = [];

  if (draft.created_property_id) {
    const [propertyResult, unitResult] = await Promise.all([
      supabase
        .from("properties")
        .select("calendar_preference")
        .eq("id", draft.created_property_id)
        .maybeSingle(),
      supabase
        .from("property_units")
        .select("id")
        .eq("property_id", draft.created_property_id)
        .eq("is_primary", true)
        .maybeSingle(),
    ]);

    if (!propertyResult.error && propertyResult.data) {
      propertyCalendarPreference = normalizedCalendarPreference(
        propertyResult.data.calendar_preference,
      );
    }

    if (!unitResult.error && unitResult.data?.id) {
      const { data: connectionData, error: connectionError } =
        await supabase
          .from("calendar_connections")
          .select(
            "connection_kind,sync_status,last_success_at,is_active",
          )
          .eq("unit_id", unitResult.data.id)
          .eq("is_active", true);

      if (!connectionError) {
        calendarConnections =
          (connectionData ?? []) as CalendarConnectionRow[];
      }
    }
  }

  const storedCalendarPreference = normalizedCalendarPreference(
    storedForm.calendarPreference,
  );
  const hasActiveIcal = calendarConnections.some(
    (connection) =>
      connection.is_active && connection.connection_kind === "ICAL",
  );
  const hasActivePms = calendarConnections.some(
    (connection) =>
      connection.is_active &&
      ["PMS_API", "BROWSER_WORKER"].includes(connection.connection_kind),
  );

  let effectiveCalendarPreference = storedCalendarPreference;

  if (storedCalendarPreference === "UNSET") {
    effectiveCalendarPreference =
      propertyCalendarPreference !== "UNSET"
        ? propertyCalendarPreference
        : hasActiveIcal && !hasActivePms
          ? "ICAL"
          : hasActivePms && !hasActiveIcal
            ? "PMS"
            : "UNSET";
  } else if (
    storedCalendarPreference === "ICAL" &&
    !hasActiveIcal &&
    hasActivePms
  ) {
    // Repair older onboarding drafts where the host later completed a direct
    // PMS mapping but the draft still says iCal. The real connection is the
    // safer source of truth in that one-sided mismatch.
    effectiveCalendarPreference = "PMS";
  } else if (
    storedCalendarPreference === "PMS" &&
    !hasActivePms &&
    hasActiveIcal
  ) {
    effectiveCalendarPreference = "ICAL";
  }

  const formData: Record<string, string> = {
    ...storedForm,
    calendarPreference: effectiveCalendarPreference,
    hostName:
      organization.name ?? storedForm.hostName ?? "",
    contactName:
      organization.primary_contact_name ??
      storedForm.contactName ??
      "",
    phone:
      organization.contact_phone ??
      storedForm.phone ??
      "",
    email:
      organization.contact_email ??
      storedForm.email ??
      "",
    businessLocation:
      organization.business_location ??
      storedForm.businessLocation ??
      "",
  };

  const policyAccepted =
    Boolean(draft.host_policy_accepted_at) &&
    draft.host_agreement_version ===
      currentVersions.hostAgreement.version &&
    draft.cancellation_policy_version ===
      currentVersions.cancellationPolicy.version &&
    draft.privacy_notice_version ===
      currentVersions.privacyNotice.version;

  const stripeReady =
    stripeAccount?.status === "READY" &&
    Boolean(stripeAccount?.charges_enabled) &&
    Boolean(stripeAccount?.payouts_enabled);

  const availability = calendarStatus(
    effectiveCalendarPreference,
    calendarConnections,
  );

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationStatus: organization.status,
    partnerStatus: organization.partner_status,
    commissionTier: organization.commission_tier,
    currentStep: Number(draft.current_step ?? 0),
    onboardingStatus: draft.status,
    formData,
    amenities: Array.isArray(draft.amenities)
      ? draft.amenities
      : [],
    policies: Array.isArray(draft.policies)
      ? draft.policies
      : [],
    photoNames: Array.isArray(draft.photo_names)
      ? draft.photo_names
      : [],
    authorityConfirmed: Boolean(draft.authority_confirmed),
    policyAccepted,
    policyAcceptedAt:
      draft.host_policy_accepted_at ?? null,
    stripeReady,
    calendarConfigured: availability.configured,
    calendarReady: availability.ready,
    currentPolicyVersions: {
      hostAgreement:
        currentVersions.hostAgreement.version,
      cancellationPolicy:
        currentVersions.cancellationPolicy.version,
      privacyNotice:
        currentVersions.privacyNotice.version,
    },
    savedAt: draft.updated_at ?? null,
  };
}
