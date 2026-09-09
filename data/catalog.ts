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
};

// Legacy empty compatibility export. Real public inventory is loaded through
// `lib/public/listings.ts` from guest-safe Supabase RPCs and only includes
// explicitly PUBLISHED listings. Checkout intentionally still imports this empty
// array so no reservation can be created before the booking milestone.
export const properties: Property[] = [];

// These are editorial/search destinations, not inventory or booking claims.
export const destinations: Destination[] = [
  { name: "Hot Springs", detail: "Lakes, trails, downtown stays and the Ouachitas" },
  { name: "Lake Ouachita", detail: "Lake weekends, cabins and forest getaways" },
  { name: "Caddo River", detail: "River stays and small-town Arkansas escapes" },
  { name: "Eureka Springs", detail: "Ozark hills, historic streets and weekend stays" },
  { name: "Branson", detail: "Shows, lakes and family trips in southern Missouri" }
];
