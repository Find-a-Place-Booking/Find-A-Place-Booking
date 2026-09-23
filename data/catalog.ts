export type Property = {
  slug: string;
  name: string;
  location: string;
  city: string;
  state: string;
  region: string;
  type: string;
  sleeps: number;
  bedrooms: number;
  baths: number;
  price: number;
  rating: number;
  reviews: number;
  image: string;
  image2: string;
  image3: string;
  tags: string[];
  blurb: string;
  hostName: string;
  instantBook: boolean;
  lat: number;
  lng: number;
};

export type Destination = {
  name: string;
  detail: string;
  searchTerms?: string[];
};

// Legacy empty compatibility export. Real public inventory is loaded through
// `lib/public/listings.ts` from guest-safe Supabase RPCs and only includes
// explicitly PUBLISHED listings. Checkout intentionally still imports this empty
// array so no reservation can be created before the booking milestone.
export const properties: Property[] = [];

// These are editorial/search destinations, not inventory or booking claims.
// searchTerms let regional destination cards resolve nearby public-area/city
// labels without changing the property's canonical city/address data.
export const destinations: Destination[] = [
  {
    name: "Hot Springs",
    detail: "Lakes, trails, downtown stays and the Ouachitas",
    searchTerms: ["Hot Springs", "Hot Springs National Park"],
  },
  {
    name: "Lake Ouachita",
    detail: "Lake weekends, cabins and forest getaways",
    searchTerms: ["Lake Ouachita", "Mount Ida", "Mountain Harbor"],
  },
  {
    name: "Caddo River",
    detail: "River stays and small-town Arkansas escapes",
    searchTerms: ["Caddo River", "Caddo Gap", "Glenwood"],
  },
  {
    name: "Eureka Springs",
    detail: "Ozark hills, historic streets and weekend stays",
    searchTerms: ["Eureka Springs"],
  },
  {
    name: "Branson",
    detail: "Shows, lakes and family trips in southern Missouri",
    searchTerms: ["Branson"],
  },
  {
    name: "Jasper",
    detail: "Buffalo River country, Ozark views and mountain getaways",
    searchTerms: ["Jasper", "Buffalo National River", "Buffalo River", "Newton County"],
  },
];

function normalizeDestinationText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function propertyMatchesDestination(
  property: Pick<Property, "location" | "city" | "state" | "region">,
  destination: string,
) {
  const normalizedDestination = normalizeDestinationText(destination);

  if (
    !normalizedDestination ||
    normalizedDestination === "anywhere" ||
    normalizedDestination === "anywhere nearby"
  ) {
    return true;
  }

  const haystack = normalizeDestinationText(
    [property.location, property.city, property.state, property.region]
      .filter(Boolean)
      .join(" "),
  );

  const configured = destinations.find(
    (item) => normalizeDestinationText(item.name) === normalizedDestination,
  );

  if (configured) {
    const terms = configured.searchTerms?.length
      ? configured.searchTerms
      : [configured.name];

    return terms.some((term) => {
      const normalizedTerm = normalizeDestinationText(term);
      return normalizedTerm ? haystack.includes(normalizedTerm) : false;
    });
  }

  // Free-form searches such as "Jasper, AR" or "Hot Springs Arkansas" should
  // still work even when punctuation differs from the stored listing fields.
  if (haystack.includes(normalizedDestination)) return true;

  const queryTokens = normalizedDestination.split(" ").filter(Boolean);
  const propertyTokens = new Set(haystack.split(" ").filter(Boolean));

  return queryTokens.length > 0 && queryTokens.every((token) => propertyTokens.has(token));
}
