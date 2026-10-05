export type HostHelpArticle = {
  id: string;
  category:
    | "Getting started"
    | "Listing setup"
    | "Calendars & integrations"
    | "Payments & taxes"
    | "Reservations & guest tools"
    | "Troubleshooting";
  title: string;
  summary: string;
  paragraphs: string[];
  bullets?: string[];
  keywords: string[];
};

export type ContextHelp = {
  title: string;
  body: string;
  articleId: string;
  bullets?: string[];
  stripeWalkthrough?: boolean;
};

export const HOST_HELP_ARTICLES: HostHelpArticle[] = [
  {
    id: "getting-started",
    category: "Getting started",
    title: "How host setup works",
    summary:
      "The onboarding wizard builds the host profile and first property, then hands the finished listing to the normal host dashboard.",
    paragraphs: [
      "Work through the setup steps in order. Progress is saved when you move between steps, and you can go back to correct earlier information.",
      "The final Review step checks the pieces that must be ready before the first listing can finish setup.",
    ],
    bullets: [
      "Host and property basics",
      "Location, capacity and amenities",
      "At least one listing photo",
      "Rates and guest-facing policies",
      "An availability method",
      "A ready Stripe connection",
    ],
    keywords: ["onboarding", "setup", "first property", "save", "review"],
  },
  {
    id: "publishing-requirements",
    category: "Getting started",
    title: "What is required before the first listing can finish setup?",
    summary:
      "The final check is intentionally focused on booking-critical information, not every optional setting.",
    paragraphs: [
      "The listing needs the core property details, a valid nightly rate, at least one photo, a selected availability method, specific cancellation/refund terms, Stripe ready for payments, authority confirmation and the host agreement accepted.",
      "If iCal or a PMS is selected for availability, at least one real source must be connected or mapped before setup can finish.",
      "Local tax details are not a publication blocker. Find A Place applies the configured statewide taxes for the property's state, and local/county/city tax lines can be added when they apply.",
    ],
    keywords: ["publish", "publishing", "required", "review", "cancellation", "stripe", "calendar", "tax"],
  },
  {
    id: "property-details",
    category: "Listing setup",
    title: "Property name, type, location and capacity",
    summary:
      "Use the public listing name guests should recognize and enter the real property address for mapping and tax logic.",
    paragraphs: [
      "The public area is the destination guests recognize, such as Hot Springs, Lake Ouachita or Branson. The complete street address is still used internally for mapping and property-specific rules.",
      "Capacity should reflect the maximum number of guests the property can actually accommodate. Bed counts and sizes should match the sleeping arrangements guests will find on arrival.",
    ],
    keywords: ["property", "address", "location", "capacity", "beds", "bedrooms", "bathrooms"],
  },
  {
    id: "amenities",
    category: "Listing setup",
    title: "Amenities and special features",
    summary:
      "Choose amenities guests can actually use, then add a custom amenity only when the built-in choices do not cover it.",
    paragraphs: [
      "Amenities affect how guests understand and filter the stay, so avoid marking a feature that is not consistently available.",
      "Features such as hot tubs, jetted tubs, outdoor showers and access-related amenities should be described clearly enough that the guest knows what is actually provided.",
    ],
    keywords: ["amenities", "hot tub", "jetted", "outdoor shower", "atv"],
  },
  {
    id: "photos",
    category: "Listing setup",
    title: "Photos: limits, cover image and saving",
    summary:
      "Onboarding stores the real listing photos immediately instead of keeping temporary uploads.",
    paragraphs: [
      "You can upload up to 25 JPG, PNG or WebP images, up to 10 MB each. During onboarding, the first image is used as the cover image.",
      "You can continue past the Photos step without uploading immediately, but at least one photo is required before final setup can finish.",
      "Removing an image in onboarding removes it from the listing record as well.",
    ],
    keywords: ["photo", "photos", "25", "cover", "image", "upload"],
  },
  {
    id: "rates-fees",
    category: "Listing setup",
    title: "Rates, cleaning fees, pets and extra guests",
    summary:
      "Set the base stay pricing first. More advanced date rules can be managed later from Rates & fees.",
    paragraphs: [
      "A weeknight rate greater than zero is required during onboarding. Weekend, cleaning, pet and extra-guest charges should reflect what the guest will actually be charged.",
      "If you charge an extra-guest fee, tell Find A Place how many guests are included in the base nightly price so the fee can be calculated correctly.",
    ],
    keywords: ["rates", "fees", "cleaning", "pets", "extra guest", "pricing"],
  },
  {
    id: "policies",
    category: "Listing setup",
    title: "Policies and cancellation terms",
    summary:
      "Guests accept the property policies during checkout, so the wording should be specific enough to use when a booking change or cancellation is requested.",
    paragraphs: [
      "Enter the actual check-in and checkout times, house rules and cancellation/refund terms used by the property.",
      "The cancellation section must contain specific guest-facing terms before onboarding can finish. Avoid vague wording such as 'contact us for details.'",
    ],
    keywords: ["policy", "policies", "cancellation", "refund", "check in", "checkout", "house rules"],
  },
  {
    id: "calendar-overview",
    category: "Calendars & integrations",
    title: "Choosing an availability method",
    summary:
      "A property can use Find A Place only, iCal feeds, or a supported PMS connection.",
    paragraphs: [
      "Choose Find A Place only when this will be the only booking calendar for the property. Choose iCal when another booking platform or PMS provides calendar URLs. Choose PMS when the supported integration uses a direct or managed connection.",
      "If you select iCal or PMS, at least one source must be connected or mapped before onboarding can finish.",
    ],
    bullets: [
      "Airbnb, Vrbo, Lodgify, Guesty and Hostify can be connected through the supported calendar setup when an iCal feed is available.",
      "ThinkReservations uses its supported API connection and room mapping.",
      "ResNexus uses the managed ResNexus connection and resource mapping.",
    ],
    keywords: ["calendar", "availability", "ical", "pms", "airbnb", "vrbo", "lodgify", "guesty", "hostify"],
  },
  {
    id: "ical-two-way",
    category: "Calendars & integrations",
    title: "How two-way iCal setup works",
    summary:
      "Import the outside calendar into Find A Place, then import the Find A Place export back into that outside system.",
    paragraphs: [
      "First paste the property's private iCal export URL from the outside platform into Find A Place and let the first sync complete.",
      "After the connection exists, Find A Place provides an export URL for that source. Add that URL back to the matching property on the outside platform so Find A Place reservations can block dates there too.",
      "Keep each property and unit matched to its own calendar. Do not reuse the same outside feed on a different cabin or site.",
    ],
    keywords: ["ical", "two way", "export", "import", "airbnb", "vrbo", "calendar url"],
  },
  {
    id: "lodgify",
    category: "Calendars & integrations",
    title: "Using Lodgify",
    summary:
      "The current Find A Place setup uses Lodgify iCal import/export rather than a direct Lodgify API connector.",
    paragraphs: [
      "Copy the Lodgify iCal export for the specific rental and add it as a Lodgify calendar source in Find A Place.",
      "Then copy the Find A Place export URL for that connection back into the matching Lodgify rental if you want Find A Place bookings to block Lodgify too.",
      "If Lodgify is already the host's central channel manager, using Lodgify as the main inbound source is usually cleaner than importing the same Airbnb or Vrbo reservation through several overlapping feeds.",
    ],
    keywords: ["lodgify", "ical", "channel manager", "api"],
  },
  {
    id: "thinkreservations",
    category: "Calendars & integrations",
    title: "ThinkReservations setup",
    summary:
      "Use a ThinkReservations Restricted API Key and map each Find A Place property to the correct ThinkReservations room.",
    paragraphs: [
      "The connection is organization-level, so after the account is connected, additional properties normally only need the correct room/unit selected.",
      "If setup says to use a Restricted API Key, do not substitute another ThinkReservations credential type. The integration intentionally rejects the wrong key type.",
    ],
    keywords: ["thinkreservations", "think reservations", "api key", "restricted", "room mapping"],
  },
  {
    id: "resnexus",
    category: "Calendars & integrations",
    title: "ResNexus mapping and safety blocks",
    summary:
      "ResNexus properties must be mapped to the correct resource before the managed sync can protect availability.",
    paragraphs: [
      "Choose the exact cabin, room or site that belongs to the Find A Place listing. A mapping for one property should never be reused for a different unit.",
      "When ResNexus reports an unavailable range but the reservation details cannot be fully verified, Find A Place can show that range as needing verification while still blocking it to guests for safety.",
      "Those safety ranges are intentionally conservative. Resolve the underlying mapping or reservation detail instead of manually opening the dates for guests.",
    ],
    keywords: ["resnexus", "mapping", "safety", "verification", "blocked dates", "resource"],
  },
  {
    id: "stripe-setup",
    category: "Payments & taxes",
    title: "Stripe setup: existing account or new account",
    summary:
      "Hosts can use an existing Stripe login or create a Stripe account inside Find A Place.",
    paragraphs: [
      "Stripe handles the business verification, identity information and payout bank details. Find A Place does not store the host's raw bank details, identity documents or Stripe password.",
      "If the host already uses Stripe, signing in with that login can let Stripe reuse eligible verified information. Stripe may still ask for additional details required for this Find A Place connection.",
      "The Stripe connection must be ready before onboarding can move through the final review.",
    ],
    keywords: ["stripe", "payments", "bank", "identity", "existing account", "connect"],
  },
  {
    id: "stripe-website",
    category: "Payments & taxes",
    title: "What should I enter if Stripe asks for a website?",
    summary:
      "A host without a standalone website can use a public page that shows the property or business.",
    paragraphs: [
      "If Stripe asks for a website and you do not have your own site, use a public link to the Airbnb, Vrbo, Facebook business page or another booking page where guests can see the property or business.",
      "The field belongs to Stripe, so Find A Place cannot change the wording inside Stripe's secure embedded form.",
    ],
    keywords: ["stripe", "website", "airbnb", "vrbo", "facebook", "business url"],
  },
  {
    id: "taxes",
    category: "Payments & taxes",
    title: "How taxes work",
    summary:
      "Find A Place automatically applies the statewide taxes configured for the property's state. Local taxes can be added when they apply.",
    paragraphs: [
      "For Arkansas, Find A Place currently applies the statewide sales tax and statewide tourism tax at checkout. Other states can use their own configured statewide rules.",
      "County, city, lodging, tourism-district or other local taxes should only be added when they actually apply to the property.",
      "Guest tax money remains in the host's connected Stripe charge. The host is responsible for applicable filing and remittance.",
      "Not completing optional local tax setup does not stop the listing from using the automatic statewide tax rules.",
    ],
    keywords: ["tax", "taxes", "sales tax", "tourism", "arkansas", "county", "city", "remit"],
  },
  {
    id: "payments-troubleshooting",
    category: "Troubleshooting",
    title: "Stripe says setup is incomplete",
    summary:
      "Open the connected Stripe setup and look for an outstanding business, identity or payout requirement.",
    paragraphs: [
      "Stripe can require more information after the first setup session. Reopen Stripe from Payments & taxes and complete the requirement shown there.",
      "If Stripe is already complete but Find A Place still shows Not ready, use the refresh/sync action and then reload the host page. Contact Find A Place support if the two systems still disagree.",
    ],
    keywords: ["stripe", "not ready", "incomplete", "requirements", "sync"],
  },
  {
    id: "calendar-troubleshooting",
    category: "Troubleshooting",
    title: "A booking is missing or the calendar looks wrong",
    summary:
      "Start by checking the exact source, unit mapping and last successful sync instead of manually changing dates.",
    paragraphs: [
      "Confirm the affected property is connected to the correct outside feed or PMS resource. A healthy Airbnb connection does not prove that a separate Vrbo, Lodgify or PMS source is connected.",
      "Check whether the date is an imported block, a Find A Place reservation, an owner block or a ResNexus safety range. Different sources can overlap, and any active block keeps the night unavailable to guests.",
      "If the guest calendar and host calendar disagree, report the exact property and dates so the source data can be traced before changing availability.",
    ],
    keywords: ["calendar", "missing booking", "wrong dates", "sync", "blocked", "guest side", "host side"],
  },
  {
    id: "guest-emails",
    category: "Reservations & guest tools",
    title: "Automated guest emails",
    summary:
      "Hosts can schedule property/reservation emails around check-in and checkout.",
    paragraphs: [
      "Use Guest emails to create rules for pre-arrival or post-stay messages. Messages can include supported reservation placeholders such as guest name, stay dates, confirmation code, access code and trip link.",
      "If a message requires an access code, add the code before the scheduled send window or the rule will wait according to the automation rules.",
    ],
    keywords: ["guest emails", "automation", "arrival", "access code", "check in"],
  },
  {
    id: "changes-cancellations",
    category: "Reservations & guest tools",
    title: "Booking changes, cancellations and refunds",
    summary:
      "Guests request changes from My Trip; the host reviews the request under the accepted property terms.",
    paragraphs: [
      "A cancellation request does not automatically cancel the stay. The host approves or denies it under the property's saved cancellation terms.",
      "When a host-approved refund is sent, Stripe processes the refund against the host's connected charge and Find A Place reconciles the reservation and payment record.",
    ],
    keywords: ["cancellation", "refund", "change", "my trip", "reservation"],
  },
  {
    id: "support",
    category: "Troubleshooting",
    title: "When to contact Find A Place",
    summary:
      "Use host support when the problem is with the platform, account, integration or payment record rather than the physical property.",
    paragraphs: [
      "Include the property name, affected dates and what you expected to happen. For calendar problems, say which outside platform or PMS is involved. For Stripe problems, do not send passwords, bank numbers or identity documents.",
    ],
    keywords: ["support", "help", "contact", "problem"],
  },
];

export const ONBOARDING_HELP: Record<string, ContextHelp> = {
  "Host profile": {
    title: "Use the person or business guests should be able to reach.",
    body:
      "The host profile becomes the organization used by the dashboard and guest contact tools. Use a real monitored email and phone number.",
    articleId: "getting-started",
  },
  Property: {
    title: "Name the stay the way guests will recognize it.",
    body:
      "Use the public listing name, the right property type and a short description that explains what makes this specific stay worth booking.",
    articleId: "property-details",
  },
  "Location & capacity": {
    title: "The real address matters even when guests do not see it immediately.",
    body:
      "Find A Place uses the property address for mapping and state/local tax logic. Capacity and bed details should match the actual sleeping setup.",
    articleId: "property-details",
  },
  Amenities: {
    title: "Only mark amenities guests can actually use.",
    body:
      "Amenities influence search and guest expectations. Add a custom amenity only when the built-in choices do not cover the feature.",
    articleId: "amenities",
  },
  Photos: {
    title: "You can add up to 25 real listing photos.",
    body:
      "The first image is the cover during onboarding. You can move past this step now, but at least one photo is required before setup can finish.",
    articleId: "photos",
  },
  "Rates & fees": {
    title: "Start with the base price guests should actually see.",
    body:
      "Weeknight pricing is required. Add cleaning, pet or extra-guest charges only when they are real charges for this property.",
    articleId: "rates-fees",
  },
  Taxes: {
    title: "Statewide taxes are automatic; add local taxes only when they apply.",
    body:
      "Arkansas checkout applies the statewide sales and tourism taxes automatically. County, city or other local lines are property-specific and optional unless they apply.",
    articleId: "taxes",
  },
  Policies: {
    title: "Write cancellation terms that can be used when a real request comes in.",
    body:
      "Guests accept these property terms during checkout. Keep check-in, checkout, house rules and cancellation/refund wording specific.",
    articleId: "policies",
  },
  Calendar: {
    title: "Connect the source that truly controls this property's availability.",
    body:
      "Use Find A Place only, iCal, or a supported PMS. If you choose iCal/PMS, finish at least one real connection or mapping before moving on.",
    articleId: "calendar-overview",
  },
  Payments: {
    title: "Stripe handles the sensitive payment-account setup.",
    body:
      "Use your existing Stripe login or create a new account. If Stripe asks for a website and you do not have one, a public Airbnb, Vrbo, Facebook business or booking page can usually be used.",
    articleId: "stripe-setup",
    stripeWalkthrough: true,
  },
  Review: {
    title: "Review is the booking-readiness check.",
    body:
      "This is where missing booking-critical setup is caught before the first listing is finalized. Optional local tax details can still be completed later.",
    articleId: "publishing-requirements",
  },
};

export const HOST_ROUTE_HELP: Array<{
  prefix: string;
  help: ContextHelp;
}> = [
  {
    prefix: "/host/calendar",
    help: {
      title: "Every block should have a source.",
      body:
        "Use the calendar labels and date details to tell imported bookings, owner blocks, Find A Place reservations and safety ranges apart before changing anything.",
      articleId: "calendar-troubleshooting",
    },
  },
  {
    prefix: "/host/integrations",
    help: {
      title: "Map each integration to the exact property/unit.",
      body:
        "Do not reuse a calendar feed or PMS resource from another cabin or site. Verify the source and one known reservation before relying on it.",
      articleId: "calendar-overview",
    },
  },
  {
    prefix: "/host/payments",
    help: {
      title: "Stripe and taxes are separate pieces of payment readiness.",
      body:
        "Stripe must be ready to take guest payments. Statewide taxes are automatic; add property-specific local taxes only when they apply.",
      articleId: "stripe-setup",
      stripeWalkthrough: true,
    },
  },
  {
    prefix: "/host/rates",
    help: {
      title: "Use advanced rate rules only for real pricing exceptions.",
      body:
        "Base pricing should stay understandable. Date-specific and seasonal rules should be used when the rate truly changes for those dates.",
      articleId: "rates-fees",
    },
  },
  {
    prefix: "/host/properties",
    help: {
      title: "Property settings should match what the guest will actually receive.",
      body:
        "Keep capacity, beds, amenities, photos, policies and booking details consistent with the live property.",
      articleId: "property-details",
    },
  },
  {
    prefix: "/host/guest-emails",
    help: {
      title: "Automations should help the guest, not create duplicate noise.",
      body:
        "Keep rules property-specific when instructions differ, and make sure access-code messages have the information they need before send time.",
      articleId: "guest-emails",
    },
  },
  {
    prefix: "/host/reservations",
    help: {
      title: "Use the reservation record as the source of truth.",
      body:
        "Review the saved stay dates, payment state, policies and guest request before approving a change, cancellation or refund.",
      articleId: "changes-cancellations",
    },
  },
  {
    prefix: "/host/messages",
    help: {
      title: "Keep stay-specific communication tied to the reservation.",
      body:
        "Use the reservation message thread for guest questions so the stay context stays together.",
      articleId: "changes-cancellations",
    },
  },
  {
    prefix: "/host/settings",
    help: {
      title: "Keep account contact information current.",
      body:
        "Use a monitored email and phone number so reservation and support communication reaches the right person.",
      articleId: "getting-started",
    },
  },
  {
    prefix: "/host",
    help: {
      title: "Use the dashboard as the starting point for anything already live.",
      body:
        "Properties, calendars, reservations, payments and guest communication each have their own workspace. The Host FAQ explains the setup and troubleshooting paths.",
      articleId: "getting-started",
    },
  },
];

export function hostHelpArticle(id: string | null | undefined) {
  if (!id) return null;
  return HOST_HELP_ARTICLES.find((article) => article.id === id) ?? null;
}
