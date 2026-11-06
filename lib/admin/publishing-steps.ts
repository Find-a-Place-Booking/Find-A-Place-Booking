/** Friendly UI guidance for the database's authoritative publication issues.
 * This intentionally never changes or hides the underlying readiness checks.
 */
export type FixOwner = "admin" | "host" | "platform";

export type PublishingIssue = {
  original: string;
  title: string;
  explanation: string;
  section: "basics" | "location" | "pricing" | "photos" | "calendar" | "checkout" | "host-actions" | "support";
  owner: FixOwner;
  button: string;
};

function item(original: string, title: string, explanation: string,
  section: PublishingIssue["section"], owner: FixOwner = "admin", button = "Fix this") : PublishingIssue {
  return { original, title, explanation, section, owner, button };
}

export function explainPublishingIssue(original: string): PublishingIssue {
  const issue = original.toLowerCase();
  if (issue === "property name") return item(original, "Add a property name", "Give this stay a name guests will recognize.", "basics");
  if (issue === "description") return item(original, "Add a description", "Tell guests what makes this stay useful or special.", "basics");
  if (issue === "property type") return item(original, "Choose a property type", "For example, cabin, cottage or vacation home.", "basics");
  if (issue === "public area or city") return item(original, "Add a destination", "Enter the town or public area guests should see.", "basics");
  if (issue === "state / region") return item(original, "Add the state", "Use the two-letter state abbreviation.", "location");
  if (issue.includes("street address")) return item(original, "Complete the address", "The private street address, city and ZIP are required.", "location");
  if (issue === "maximum guests") return item(original, "Set guest capacity", "Enter how many guests the stay can accommodate.", "basics");
  if (issue === "weeknight rate") return item(original, "Enter a nightly price", "Add the base weeknight rate in dollars.", "pricing");
  if (issue.includes("cancellation/refund")) return item(original, "Add cancellation terms", "Write the actual refund and cancellation rules guests must agree to.", "pricing");
  if (issue.includes("property photo")) return item(original, "Add at least one photo", "Upload a photo supplied or approved by the host.", "photos", "admin", "Add photo");
  if (issue.startsWith("choose calendar preference")) return item(original, "Choose a calendar method", "Select how this stay's dates will be managed.", "calendar");
  if (issue.includes("successfully sync") || issue.includes("calendar feed")) return item(original, "Calendar needs a successful sync", "The host must connect or repair their availability feed; don't switch to manual to bypass it.", "host-actions", "host", "Check connection");
  if (issue.includes("live checkout after")) return item(original, "Enable checkout", "After verifying the listing and payments, turn on live checkout.", "checkout");
  if (issue.includes("stripe")) return item(original, "Stripe is not ready", "The host must finish connecting Stripe and enable charges and payouts.", "host-actions", "host", "View host");
  if (issue.includes("tax responsibility")) return item(original, "Tax setup needs confirmation", "Have the host complete required tax acknowledgements and local tax settings.", "host-actions", "host", "Review taxes");
  if (issue.includes("host agreement")) return item(original, "Host Agreement not accepted", "The host must accept this themselves; admins cannot do it for them.", "host-actions", "host", "View host");
  if (issue.includes("authority to list")) return item(original, "Host approval is missing", "The host must personally confirm they have authority to list this stay.", "host-actions", "host", "View host");
  if (issue.includes("primary rentable unit") || issue.includes("activate primary")) return item(original, "Rentable unit needs attention", "Open the property record and check the primary unit.", "support", "admin", "Open property");
  if (issue.includes("onboarding record")) return item(original, "Host setup record needs review", "The linked host-onboarding record is missing. Contact operations before publishing.", "support", "platform", "Review account");
  if (issue.includes("tennessee") || issue.includes("statewide lodging-tax") || issue.includes("state not cleared"))
    return item(original, "State publishing is restricted", "Operations must resolve state support and tax requirements first.", "support", "platform", "Review tax setup");
  if (issue.includes("archived")) return item(original, "Listing is archived", "An archived listing cannot be published from this tool.", "support", "platform", "View property");
  return item(original, original, "Review this requirement before publishing.", "support", "platform", "Review issue");
}

export function sortPublishingIssues(issues: PublishingIssue[]) {
  // Give staff a quick fix before asking the host to do something else.
  const rank: Record<FixOwner, number> = { admin: 0, host: 1, platform: 2 };
  return [...issues].sort((a, b) => rank[a.owner] - rank[b.owner]);
}

export function issueOwnerLabel(owner: FixOwner) {
  if (owner === "admin") return "We can fix this";
  if (owner === "host") return "Host needs to help";
  return "Operations review";
}
