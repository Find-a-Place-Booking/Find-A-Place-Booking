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

/** The two property editors have fixed meanings. Never allow an edit to
 * silently reassign the property, event or canonical type of an existing rule. */
function canonicalRuleError(name: string, triggerEvent: string) {
  if (name === "Pre-arrival instructions" && triggerEvent !== "BEFORE_CHECKIN") {
    return "Pre-arrival instructions must be scheduled before check-in.";
  }
  if (name === "Post-stay thank you" && triggerEvent !== "AFTER_CHECKOUT") {
    return "Post-stay emails must be scheduled after checkout.";
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

  const canonicalError = canonicalRuleError(name, triggerEvent);
  if (canonicalError) go(returnTo, "error", canonicalError);

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
    // A stale/incorrect form must not silently overwrite the other email.
    // Check identity before saving AND repeat it as an UPDATE filter.
    const { data: existingRule, error: lookupError } = await supabase
      .from("host_guest_email_rules")
      .select("id,property_id,trigger_event")
      .eq("id", ruleId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      lookupError ||
      !existingRule ||
      existingRule.property_id !== propertyId ||
      existingRule.trigger_event !== triggerEvent
    ) {
      go(
        returnTo,
        "error",
        "This email setup changed or its form is outdated. Refresh the page and try again; no other email was changed.",
      );
    }

    let update = supabase
      .from("host_guest_email_rules")
      .update(values)
      .eq("id", ruleId)
      .eq("organization_id", organizationId)
      .eq("trigger_event", triggerEvent);
    if (propertyId) {
      update = update.eq("property_id", propertyId);
    } else {
      update = update.is("property_id", null);
    }

    const { data: saved, error } = await update.select("id").maybeSingle();
    if (error || !saved) {
      console.error("[saveGuestEmailRule:update]", error);
      go(returnTo, "error", "That email could not be updated. Refresh and try again.");
    }
  } else {
    // A missing rule ID is a CREATE, never an update of whichever rule happens
    // to exist first. The database enforces one canonical rule per event/property.
    if (propertyId && (name === "Pre-arrival instructions" || name === "Post-stay thank you")) {
      const { data: existing, error: lookupError } = await supabase
        .from("host_guest_email_rules")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("property_id", propertyId)
        .eq("trigger_event", triggerEvent)
        .eq("name", name)
        .maybeSingle();
      if (lookupError) {
        go(returnTo, "error", "Unable to check the email setup. Try again.");
      }
      if (existing) {
        go(returnTo, "error", "This email already has a saved setup. Refresh the page before editing it.");
      }
    }

    const { error } = await supabase.from("host_guest_email_rules").insert({
      ...values,
      created_by: profileId,
    });

    if (error) {
      console.error("[saveGuestEmailRule:insert]", error);
      go(
        returnTo,
        "error",
        error.code === "23505"
          ? "This email already exists. Refresh the page to edit it."
          : "The guest email automation could not be created.",
      );
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
