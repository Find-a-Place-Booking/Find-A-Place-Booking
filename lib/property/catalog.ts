export const propertyTypes = [
  "Cabin",
  "House",
  "Condo",
  "Townhome",
  "Apartment",
  "Tiny home",
  "Cottage",
  "Villa",
  "Lodge",
  "A-frame",
  "Bungalow",
  "Farm stay",
  "Guest suite",
  "Treehouse",
  "RV / Camper",
  "Yurt",
  "Other",
] as const;

export const amenityGroups = [
  {
    title: "Essentials",
    items: [
      "Wi-Fi",
      "Air conditioning",
      "Heating",
      "Full kitchen",
      "Kitchenette",
      "Washer",
      "Dryer",
      "Dedicated workspace",
      "TV",
      "Smart TV / streaming",
      "Hair dryer",
      "Iron",
      "Linens provided",
      "Towels provided",
    ],
  },
  {
    title: "Outdoor & property",
    items: [
      "Hot tub",
      "Pool",
      "Private pool",
      "Shared pool",
      "Fire pit",
      "Outdoor dining area",
      "Patio / deck",
      "Balcony",
      "Porch",
      "BBQ grill",
      "Outdoor kitchen",
      "Fenced yard",
      "Garden / yard",
      "Mountain view",
      "Lake view",
      "River view",
      "Waterfront",
      "Private entrance",
      "Self check-in",
    ],
  },
  {
    title: "Water access & recreation",
    items: [
      "Private dock",
      "Shared dock",
      "Boat slip",
      "Lake access",
      "River access",
      "Beach access",
      "Fishing access",
      "Boat ramp nearby",
      "Kayaks provided",
      "Canoes provided",
      "Paddleboards provided",
      "Trail access",
    ],
  },
  {
    title: "Parking & access",
    items: [
      "Free parking",
      "Covered parking",
      "RV / trailer parking",
      "EV charger",
      "Step-free access",
      "Wheelchair accessible",
    ],
  },
  {
    title: "Family & pet friendly",
    items: [
      "Pets allowed",
      "Pack 'n play / crib",
      "High chair",
      "Children's books / toys",
      "Game room",
      "Board games",
    ],
  },
  {
    title: "Safety",
    items: [
      "Smoke detector",
      "Carbon monoxide detector",
      "Fire extinguisher",
      "First aid kit",
      "Security cameras on exterior",
    ],
  },
] as const;

export const policyGroups = [
  {
    title: "Common policies",
    items: [
      "No smoking",
      "No parties or events",
      "Quiet hours apply",
      "Pets allowed",
      "Minimum booking age applies",
      "No unregistered guests",
    ],
  },
  {
    title: "Property care",
    items: [
      "Treat the home with care",
      "Report damage promptly",
      "Follow checkout instructions",
      "Do not move furniture",
      "Do not tamper with safety devices",
    ],
  },
  {
    title: "Waterfront / outdoor safety",
    items: [
      "Children must be supervised outdoors",
      "Use hot tub at your own risk",
      "Pool use at your own risk",
      "Dock / waterfront use at your own risk",
      "Life jackets recommended for water activities",
      "Fire pit use must follow posted instructions",
    ],
  },
] as const;

export const calendarPreferences = [
  {
    value: "UNSET",
    label: "Decide later",
    detail:
      "You can finish the listing now and choose your calendar setup after onboarding.",
  },
  {
    value: "PLATFORM_ONLY",
    label: "Use Find A Place only",
    detail:
      "Manage availability directly inside the Find A Place host dashboard.",
  },
  {
    value: "ICAL_IMPORT",
    label: "Import another calendar",
    detail:
      "Use an iCal feed from another platform or PMS to keep dates in sync.",
  },
  {
    value: "ICAL_EXPORT",
    label: "Export my Find A Place calendar",
    detail:
      "Use Find A Place as the source calendar and export it to another system.",
  },
  {
    value: "TWO_WAY_SYNC",
    label: "Two-way sync / PMS",
    detail:
      "You plan to sync with an external booking or property-management system.",
  },
] as const;
