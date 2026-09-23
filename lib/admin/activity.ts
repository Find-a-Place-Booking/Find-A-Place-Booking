export type ActivityCategory =
  | "booking"
  | "cancellation"
  | "payment"
  | "property"
  | "account"
  | "content"
  | "admin"
  | "other";

const exactTitles: Record<string, string> = {
  "profile.created": "Profile created",
  "organization.created": "Host organization created",

  "property.created_from_onboarding": "Property added",
  "property.created_blank": "Property added",
  "property.updated": "Property updated",
  "property.live_updated": "Live property updated",
  "property.paused_updated": "Paused property updated",
  "property.policy_document_uploaded": "Property policy PDF updated",
  "property.homepage_feature_priority_changed": "Featured priority changed",
  "property.live_checkout_enabled": "Live checkout enabled",
  "property.live_checkout_disabled": "Live checkout disabled",

  "partner_verification.approved": "Partner rate approved",
  "partner_verification.kept_standard": "Standard host rate kept",
  "host_policy.accepted": "Host accepted platform policies",

  "site_content.updated": "Site copy updated",
  "platform_policy.updated": "Platform policy updated",

  "payment_account.connected": "Stripe account connected",
  "payment_account.ready": "Stripe account ready",
  "payment_account.restricted": "Stripe account needs attention",
  "payment_account.disabled": "Stripe account disabled",
  "payment_account.status_changed": "Stripe account status changed",

  "reservation.guest_hold_created": "Booking created",
  "reservation.hold_created": "Booking created",
  "reservation.hold_expired": "Booking hold expired",
  "reservation.hold_cancelled": "Booking hold cancelled",
  "reservation.payment_succeeded": "Booking confirmed",
  "reservation.payment_failed": "Payment failed",
  "reservation.payment_processing": "Payment processing",
  "reservation.guest_policies_accepted": "Guest accepted booking policies",
  "reservation.guest_cancellation_requested": "Cancellation requested",
  "reservation.host_cancellation_approved": "Cancellation approved",
  "reservation.host_cancellation_approved_no_refund":
    "Cancellation approved · no refund",
  "reservation.host_cancellation_declined": "Cancellation declined",
  "reservation.cancellation_completed": "Booking cancelled",
  "reservation.refund_requested": "Refund started",
  "reservation.refund_created": "Refund started",
  "reservation.refund_succeeded": "Refund completed",
  "reservation.refund_failed": "Refund failed",
  "reservation.guest_change_requested": "Booking change requested",
  "reservation.host_change_approved": "Booking change approved",
  "reservation.host_change_declined": "Booking change declined",
  "reservation.change_applied": "Booking dates changed",
  "reservation.dispute_created": "Payment dispute opened",
  "reservation.dispute_updated": "Payment dispute updated",
  "reservation.dispute_closed": "Payment dispute closed",
};

function titleCaseMachineCode(value: string) {
  return value
    .replace(/^reservation\./, "")
    .replace(/^reservation_event\./, "")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function activityTitle(action: string) {
  if (exactTitles[action]) return exactTitles[action];

  if (action.startsWith("reservation.")) {
    const suffix = action.slice("reservation.".length);

    if (suffix.includes("cancellation") && suffix.includes("request")) {
      return "Cancellation requested";
    }
    if (suffix.includes("cancellation") && suffix.includes("declin")) {
      return "Cancellation declined";
    }
    if (suffix.includes("cancellation") && suffix.includes("approv")) {
      return "Cancellation approved";
    }
    if (suffix.includes("refund") && suffix.includes("fail")) {
      return "Refund failed";
    }
    if (suffix.includes("refund") && suffix.includes("succeed")) {
      return "Refund completed";
    }
    if (suffix.includes("refund")) return "Refund updated";
    if (suffix.includes("payment") && suffix.includes("fail")) {
      return "Payment failed";
    }
    if (suffix.includes("payment") && suffix.includes("succeed")) {
      return "Booking confirmed";
    }
    if (suffix.includes("hold") && suffix.includes("expire")) {
      return "Booking hold expired";
    }
    if (suffix.includes("hold")) return "Booking updated";
    if (suffix.includes("change") && suffix.includes("request")) {
      return "Booking change requested";
    }
    if (suffix.includes("change")) return "Booking changed";
  }

  if (action.startsWith("property.") && action.includes("publish")) {
    return "Property published";
  }
  if (action.startsWith("property.") && action.includes("approve")) {
    return "Property approved";
  }
  if (action.startsWith("property.") && action.includes("reject")) {
    return "Property rejected";
  }
  if (action.startsWith("property.") && action.includes("change")) {
    return "Property changes requested";
  }

  return titleCaseMachineCode(action) || "Platform activity";
}

export function activityCategory(
  eventCategory: string | null | undefined,
  action: string,
  entityType: string,
): ActivityCategory {
  if (
    eventCategory &&
    ["booking", "cancellation", "payment", "property", "account", "content", "admin", "other"].includes(
      eventCategory,
    )
  ) {
    return eventCategory as ActivityCategory;
  }

  const normalized = `${action} ${entityType}`.toLowerCase();

  if (normalized.includes("cancellation")) return "cancellation";
  if (
    normalized.includes("payment") ||
    normalized.includes("refund") ||
    normalized.includes("dispute")
  ) {
    return "payment";
  }
  if (
    normalized.includes("reservation") ||
    normalized.includes("booking") ||
    normalized.includes("hold") ||
    normalized.includes("guest_policies")
  ) {
    return "booking";
  }
  if (normalized.includes("property")) return "property";
  if (
    normalized.includes("profile") ||
    normalized.includes("organization") ||
    normalized.includes("partner") ||
    normalized.includes("payment_account") ||
    normalized.includes("host_policy")
  ) {
    return "account";
  }
  if (
    normalized.includes("content") ||
    normalized.includes("policy.updated")
  ) {
    return "content";
  }
  if (normalized.includes("admin")) return "admin";

  return "other";
}

export function activityCategoryLabel(category: ActivityCategory) {
  const labels: Record<ActivityCategory, string> = {
    booking: "Booking",
    cancellation: "Cancellation",
    payment: "Payment",
    property: "Property",
    account: "Account",
    content: "Content",
    admin: "Admin",
    other: "Platform",
  };

  return labels[category];
}
