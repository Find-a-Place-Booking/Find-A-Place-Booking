export const amenityGroups = [
  {
    title: "Popular",
    items: [
      "Wi-Fi",
      "Hot tub",
      "Pool",
      "Pet friendly",
      "Fire pit",
      "Waterfront",
      "Full kitchen",
    ],
  },
  {
    title: "Kitchen & dining",
    items: [
      "Refrigerator",
      "Oven / stove",
      "Dishwasher",
      "Microwave",
      "Coffee maker",
      "Grill",
      "Dining table",
    ],
  },
  {
    title: "Comfort & entertainment",
    items: [
      "Air conditioning",
      "Heating",
      "Fireplace",
      "Washer / dryer",
      "TV",
      "Game room",
      "Workspace",
    ],
  },
  {
    title: "Outdoor & location",
    items: [
      "Outdoor seating",
      "Private deck / patio",
      "Pool",
      "Private pool",
      "Shared pool",
      "Dock",
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
      "Mountain view",
      "Lake view",
      "River view",
      "Private acreage",
    ],
  },
  {
    title: "Parking & access",
    items: [
      "Free parking",
      "Boat parking",
      "EV charging",
      "Self check-in",
      "Smart lock",
      "Step-free entrance",
      "Accessible parking",
    ],
  },
] as const;

export const policyGroups = [
  {
    title: "House rules",
    items: [
      "No smoking indoors",
      "No parties or unauthorized events",
      "Registered guests only",
      "Parking limited to designated areas",
    ],
  },
  {
    title: "Noise, safety & property",
    items: [
      "Quiet hours apply",
      "No fireworks",
      "No glass near pool / hot tub",
      "Exterior security cameras disclosed",
      "Guests responsible for excessive damage",
    ],
  },
  {
    title: "Guests & pets",
    items: [
      "Pets allowed",
      "Children must be supervised",
      "Minimum booking age applies",
    ],
  },
] as const;

export const propertyTypes = [
  "Cabin",
  "House",
  "Cottage",
  "Lodge",
  "Condo",
  "RV Site",
  "Glamping",
  "Tiny Home",
  "Other",
] as const;

export const calendarPreferences = [
  {
    value: "UNSET",
    label: "Decide later",
    detail:
      "Save the property now and choose the connection when calendar setup begins.",
  },
  {
    value: "ICAL",
    label: "iCal / ICS",
    detail:
      "Universal import/export fallback for Airbnb, Vrbo and many booking systems.",
  },
  {
    value: "PMS",
    label: "PMS / channel manager",
    detail:
      "Use the system you already manage as the source of truth where a direct integration is available.",
  },
  {
    value: "NONE",
    label: "Find A Place only",
    detail:
      "No outside calendar source selected yet. Availability connections will be managed from the Calendar workspace.",
  },
] as const;
