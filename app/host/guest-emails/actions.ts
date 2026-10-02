"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const allowedVariables = new Set([
  "guest_name",
  "property_name",
  "check_in",
  "check_out",
  "confirmation_code",
  "access_code",
  "arrival_notes",
  "host_name",
  "host_email",
  "host_phone",
  "trip_url",
]);

function field(formData: FormData, key: string, max = 8000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function safeGuestEmailReturnPath(formData: FormData) {
  const requested = field(formData, "return_to", 500);
  if (
    requested.startsWith("/host/guest-emails") &&
    !requested.startsWith("//")
  ) {
    return requested;
  }
  return "/host/guest-emails";
}

function go(
  returnTo: string,
  kind: "saved" | "error",
  message?: string,
): never {
  const params = new URLSearchParams();
  params.set(kind, kind === "saved" ? "1" : message || "Unable to save.");
  redirect(`${returnTo}?${params.toString()}`);
}

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");
  return { supabase, profileId };
}

async function canManageOrganization(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  organizationId: string,
) {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"])
    .maybeSingle();

  return Boolean(data);
}

function templateError(value: string) {
  for (const match of value.matchAll(/{{\s*([a-z_]+)\s*}}/gi)) {
    const key = match[1].toLowerCase();
    if (!allowedVariables.has(key)) {
      return `Unknown template variable: {{${match[1]}}}`;
    }
  }
  return null;
}

export async function saveGuestEmailRule(formData: FormData) {
  const returnTo = safeGuestEmailReturnPath(formData);
  let organizationId = field(formData, "organization_id", 100);
  const propertyId = field(formData, "property_id", 100) || null;
  const ruleId = field(formData, "rule_id", 100) || null;
  const name = field(formData, "name", 120);
  const triggerEvent = field(formData, "trigger_event", 40);
  const dayOffset = Number(field(formData, "day_offset", 3));
  const sendTimeLocal = field(formData, "send_time_local", 8);
  const subjectTemplate = field(formData, "subject_template", 200);
  const bodyTemplate = field(formData, "body_template", 8000);
  const requireAccessCode = formData.get("require_access_code") === "on";
  const defaultAccessCode =
    triggerEvent === "BEFORE_CHECKIN"
      ? field(formData, "default_access_code", 160) || null
      : null;
  const defaultArrivalNotes =
    triggerEvent === "BEFORE_CHECKIN"
      ? field(formData, "default_arrival_notes", 5000) || null
      : null;
  const isActive = formData.get("is_active") !== "off";

  if (
    !name ||
    !["BEFORE_CHECKIN", "AFTER_CHECKOUT"].includes(triggerEvent) ||
    !Number.isInteger(dayOffset) ||
    dayOffset < 0 ||
    dayOffset > 60 ||
    !/^\d{2}:\d{2}$/.test(sendTimeLocal) ||
    !subjectTemplate ||
    !bodyTemplate
  ) {
    go(returnTo, "error", "Check the automation name, timing, subject and message.");
  }

  const invalidVariable =
    templateError(subjectTemplate) || templateError(bodyTemplate);
  if (invalidVariable) go(returnTo, "error", invalidVariable);

  const { supabase, profileId } = await requireHost();

  if (propertyId) {
    const { data: property } = await supabase
      .from("properties")
      .select("id,organization_id")
      .eq("id", propertyId)
      .maybeSingle();

    if (!property?.organization_id) {
      go(returnTo, "error", "That property is not available to this host account.");
    }
    organizationId = property.organization_id;
  }

  if (
    !organizationId ||
    !(await canManageOrganization(supabase, profileId, organizationId))
  ) {
    go(returnTo, "error", "Organization owner or manager access required.");
  }

  const values = {
    organization_id: organizationId,
    property_id: propertyId,
    name,
    trigger_event: triggerEvent,
    day_offset: dayOffset,
    send_time_local: sendTimeLocal,
    subject_template: subjectTemplate,
    body_template: bodyTemplate,
    require_access_code: requireAccessCode,
    default_access_code: defaultAccessCode,
    default_arrival_notes: defaultArrivalNotes,
    is_active: isActive,
  };

  if (ruleId) {
    const { error } = await supabase
      .from("host_guest_email_rules")
      .update(values)
      .eq("id", ruleId)
      .eq("organization_id", organizationId);

    if (error) {
      console.error("[saveGuestEmailRule:update]", error);
      go(returnTo, "error", "The guest email automation could not be updated.");
    }
  } else {
    const { error } = await supabase.from("host_guest_email_rules").insert({
      ...values,
      created_by: profileId,
    });

    if (error) {
      console.error("[saveGuestEmailRule:insert]", error);
      go(returnTo, "error", "The guest email automation could not be created.");
    }
  }

  revalidatePath("/host/guest-emails");
  revalidatePath(returnTo);
  go(returnTo, "saved");
}

export async function toggleGuestEmailRule(formData: FormData) {
  const returnTo = safeGuestEmailReturnPath(formData);
  const ruleId = field(formData, "rule_id", 100);
  const organizationId = field(formData, "organization_id", 100);
  const nextActive = field(formData, "next_active", 10) === "true";
  const { supabase, profileId } = await requireHost();

  if (!(await canManageOrganization(supabase, profileId, organizationId))) {
    go(returnTo, "error", "Organization owner or manager access required.");
  }

  const { error } = await supabase
    .from("host_guest_email_rules")
    .update({ is_active: nextActive })
    .eq("id", ruleId)
    .eq("organization_id", organizationId);

  if (error) go(returnTo, "error", "The automation status could not be changed.");
  revalidatePath("/host/guest-emails");
  revalidatePath(returnTo);
  go(returnTo, "saved");
}

export async function deleteGuestEmailRule(formData: FormData) {
  const returnTo = safeGuestEmailReturnPath(formData);
  const ruleId = field(formData, "rule_id", 100);
  const organizationId = field(formData, "organization_id", 100);
  const { supabase, profileId } = await requireHost();

  if (!(await canManageOrganization(supabase, profileId, organizationId))) {
    go(returnTo, "error", "Organization owner or manager access required.");
  }

  const { error } = await supabase
    .from("host_guest_email_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", organizationId);

  if (error) go(returnTo, "error", "The automation could not be deleted.");
  revalidatePath("/host/guest-emails");
  revalidatePath(returnTo);
  go(returnTo, "saved");
}

export async function saveReservationGuestInstructions(formData: FormData) {
  const returnTo = safeGuestEmailReturnPath(formData);
  const reservationId = field(formData, "reservation_id", 100);
  const accessCode = field(formData, "access_code", 160) || null;
  const arrivalNotes = field(formData, "arrival_notes", 5000) || null;
  const { supabase, profileId } = await requireHost();

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id")
    .eq("id", reservationId)
    .maybeSingle();

  if (!reservation) {
    go(returnTo, "error", "That reservation is not available to this host.");
  }

  const { error } = await supabase
    .from("reservation_guest_instructions")
    .upsert(
      {
        reservation_id: reservationId,
        access_code: accessCode,
        arrival_notes: arrivalNotes,
        updated_by: profileId,
      },
      { onConflict: "reservation_id" },
    );

  if (error) {
    console.error("[saveReservationGuestInstructions]", error);
    go(returnTo, "error", "Arrival instructions could not be saved.");
  }

  revalidatePath("/host/guest-emails");
  revalidatePath(returnTo);
  go(returnTo, "saved");
}
