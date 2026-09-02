export type Property = {
  slug: string;
  name: string;
  location: string;
  city: string;
  state: "Arkansas" | "Missouri";
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
  featured?: boolean;
  instantBook?: boolean;
  lat: number;
  lng: number;
};

export const properties: Property[] = [
  {
    slug: "ouachita-ridge-cabin",
    name: "Ouachita Ridge Cabin",
    location: "Mount Ida, Arkansas",
    city: "Mount Ida",
    state: "Arkansas",
    region: "Lake Ouachita",
    type: "Cabin",
    sleeps: 6,
    bedrooms: 2,
    baths: 2,
    price: 189,
    rating: 4.96,
    reviews: 87,
    image: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["Hot tub", "Pet friendly", "Mountain view", "Fire pit"],
    blurb: "A quiet timber cabin tucked above the Ouachitas with a broad porch, private hot tub and quick access to the lake and trails.",
    hostName: "Ouachita Ridge Stays",
    featured: true,
    instantBook: true,
    lat: 34.5568,
    lng: -93.6346
  },
  {
    slug: "buffalo-river-hideaway",
    name: "Buffalo River Hideaway",
    location: "Jasper, Arkansas",
    city: "Jasper",
    state: "Arkansas",
    region: "Upper Buffalo",
    type: "Cabin",
    sleeps: 4,
    bedrooms: 1,
    baths: 1,
    price: 164,
    rating: 4.91,
    reviews: 62,
    image: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["River access", "Fire pit", "Secluded", "Hiking nearby"],
    blurb: "A simple, well-kept basecamp for river days, hiking mornings and slow evenings under the trees.",
    hostName: "Buffalo River Hideaways",
    instantBook: true,
    lat: 36.0081,
    lng: -93.1866
  },
  {
    slug: "little-missouri-lodge",
    name: "Little Missouri Lodge",
    location: "Norman, Arkansas",
    city: "Norman",
    state: "Arkansas",
    region: "Ouachita Mountains",
    type: "Lodge",
    sleeps: 10,
    bedrooms: 4,
    baths: 3,
    price: 279,
    rating: 4.98,
    reviews: 114,
    image: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["Family stay", "Creek nearby", "Large group", "Game room"],
    blurb: "Room for the whole crew, close to the Little Missouri and the trails that make this corner of Arkansas worth the drive.",
    hostName: "Little Missouri Lodge Co.",
    featured: true,
    lat: 34.4595,
    lng: -93.6744
  },
  {
    slug: "ozark-glass-house",
    name: "Ozark Glass House",
    location: "Branson West, Missouri",
    city: "Branson West",
    state: "Missouri",
    region: "Table Rock Lake",
    type: "Cottage",
    sleeps: 2,
    bedrooms: 1,
    baths: 1,
    price: 229,
    rating: 4.94,
    reviews: 48,
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85",
    tags: ["Couples", "Lake view", "Design stay", "Hot tub"],
    blurb: "A polished two-person retreat with long views, a quiet deck and an intentionally simple interior.",
    hostName: "Ozark Glass House",
    instantBook: true,
    lat: 36.6962,
    lng: -93.3694
  },
  {
    slug: "caddo-gap-camp",
    name: "Caddo Gap Camp House",
    location: "Caddo Gap, Arkansas",
    city: "Caddo Gap",
    state: "Arkansas",
    region: "Caddo River",
    type: "Cabin",
    sleeps: 8,
    bedrooms: 3,
    baths: 2,
    price: 214,
    rating: 4.89,
    reviews: 39,
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1200&q=85",
    tags: ["River", "Kayak friendly", "Fire pit", "Pet friendly"],
    blurb: "Made for float trips and family weekends, with room for gear and an easy drive to river access.",
    hostName: "Caddo Gap Camp House",
    lat: 34.3990,
    lng: -93.6166
  },
  {
    slug: "hot-springs-treehouse",
    name: "Hot Springs Treehouse",
    location: "Hot Springs, Arkansas",
    city: "Hot Springs",
    state: "Arkansas",
    region: "Hot Springs",
    type: "Treehouse",
    sleeps: 2,
    bedrooms: 1,
    baths: 1,
    price: 248,
    rating: 4.97,
    reviews: 73,
    image: "https://images.unsplash.com/photo-1520984032042-162d526883e0?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["Hot tub", "Couples", "Near downtown", "Private deck"],
    blurb: "A tucked-away stay close enough for dinner downtown and quiet enough to forget the city is there.",
    hostName: "Hot Springs Treehouse Co.",
    featured: true,
    instantBook: true,
    lat: 34.5037,
    lng: -93.0552
  },
  {
    slug: "eureka-springs-hillside-cottage",
    name: "Hillside Cottage",
    location: "Eureka Springs, Arkansas",
    city: "Eureka Springs",
    state: "Arkansas",
    region: "Northwest Arkansas",
    type: "Cottage",
    sleeps: 4,
    bedrooms: 2,
    baths: 1,
    price: 176,
    rating: 4.93,
    reviews: 91,
    image: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=85",
    tags: ["Walkable", "Porch", "Historic district", "Coffee setup"],
    blurb: "A small hillside cottage for an easy Eureka Springs weekend, close to town without giving up a quiet porch at the end of the day.",
    hostName: "Hillside Cottage Co.",
    instantBook: true,
    lat: 36.4012,
    lng: -93.7379
  },
  {
    slug: "table-rock-rv-retreat",
    name: "Table Rock RV Retreat",
    location: "Branson West, Missouri",
    city: "Branson West",
    state: "Missouri",
    region: "Table Rock Lake",
    type: "RV Site",
    sleeps: 6,
    bedrooms: 0,
    baths: 1,
    price: 72,
    rating: 4.90,
    reviews: 54,
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1200&q=85",
    tags: ["Full hookup", "Lake access", "Big-rig friendly", "Pet friendly"],
    blurb: "A shaded full-hookup site near Table Rock Lake with room to settle in for a few days and explore the southern Missouri Ozarks.",
    hostName: "Table Rock RV Retreat",
    lat: 36.6990,
    lng: -93.3810
  },
  {
    slug: "hamilton-lake-cottage",
    name: "Lake Hamilton Cottage",
    location: "Hot Springs, Arkansas",
    city: "Hot Springs",
    state: "Arkansas",
    region: "Lake Hamilton",
    type: "Cottage",
    sleeps: 6,
    bedrooms: 3,
    baths: 2,
    price: 205,
    rating: 4.92,
    reviews: 68,
    image: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["Waterfront", "Dock", "Family stay", "Pet friendly"],
    blurb: "An easygoing lake cottage with a private dock, enough room for the family and a short drive into Hot Springs.",
    hostName: "Hamilton Lake Stays",
    instantBook: true,
    lat: 34.4470,
    lng: -93.0880
  },
  {
    slug: "mena-mountain-a-frame",
    name: "Mena Mountain A-Frame",
    location: "Mena, Arkansas",
    city: "Mena",
    state: "Arkansas",
    region: "Ouachita Mountains",
    type: "Cabin",
    sleeps: 4,
    bedrooms: 2,
    baths: 1,
    price: 158,
    rating: 4.88,
    reviews: 42,
    image: "https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["Mountain view", "Fire pit", "ATV nearby", "Secluded"],
    blurb: "A compact A-frame close to the Talimena drive and trail systems, with a fire pit and wide mountain views.",
    hostName: "Mena Mountain Stays",
    lat: 34.5862,
    lng: -94.2397
  },
  {
    slug: "beaver-lake-bungalow",
    name: "Beaver Lake Bungalow",
    location: "Rogers, Arkansas",
    city: "Rogers",
    state: "Arkansas",
    region: "Northwest Arkansas",
    type: "House",
    sleeps: 8,
    bedrooms: 3,
    baths: 2,
    price: 238,
    rating: 4.95,
    reviews: 106,
    image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["Lake access", "Large group", "Deck", "Bike storage"],
    blurb: "A roomy lake-area stay with space for families, bikes and long weekends exploring Northwest Arkansas.",
    hostName: "Beaver Lake Bungalow",
    lat: 36.3320,
    lng: -94.1185
  },
  {
    slug: "table-rock-family-lodge",
    name: "Table Rock Family Lodge",
    location: "Branson, Missouri",
    city: "Branson",
    state: "Missouri",
    region: "Table Rock Lake",
    type: "Lodge",
    sleeps: 12,
    bedrooms: 5,
    baths: 4,
    price: 325,
    rating: 4.96,
    reviews: 132,
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1400&q=85",
    image2: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=85",
    image3: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85",
    tags: ["Lake view", "Large group", "Hot tub", "Game room"],
    blurb: "A five-bedroom lodge made for extended families and group trips, close to Table Rock Lake and Branson.",
    hostName: "Table Rock Family Stays",
    lat: 36.6050,
    lng: -93.2940
  }
];

export const destinations = [
  { name: "Hot Springs", detail: "Lakes, downtown and the national park", count: 64 },
  { name: "Lake Ouachita", detail: "Mount Ida, lake cabins and forest stays", count: 31 },
  { name: "Caddo River", detail: "Glenwood, Caddo Gap and float-trip stays", count: 22 },
  { name: "Buffalo River", detail: "Jasper, Ponca and the upper Buffalo", count: 38 },
  { name: "Northwest Arkansas", detail: "Eureka Springs, Rogers and Beaver Lake", count: 47 },
  { name: "Branson & Table Rock", detail: "Southern Missouri and the Ozarks", count: 53 }
];

export const reservations = [
  { guest: "Megan Turner", property: "Fancy Hill Cabin 1", dates: "Sep 4–7", total: "$746", status: "Confirmed", confirmation: "FAP-84280" },
  { guest: "Caleb Ross", property: "Fancy Hill Cabin 2", dates: "Sep 8–11", total: "$1,128", status: "Confirmed", confirmation: "FAP-84284" },
  { guest: "Anna Kim", property: "Whitetail Cabin", dates: "Sep 13–15", total: "$418", status: "Pending", confirmation: "FAP-84287" },
  { guest: "Drew Hall", property: "RV Site 4", dates: "Sep 19–22", total: "$812", status: "Confirmed", confirmation: "FAP-84294" },
  { guest: "Jordan Walker", property: "Fancy Hill Cabin 1", dates: "Sep 24–27", total: "$694", status: "Confirmed", confirmation: "FAP-84302" }
];

export type HostListing = {
  slug: string;
  name: string;
  location: string;
  type: string;
  sleeps: number;
  bedrooms: number;
  baths: number;
  price: number;
  image: string;
  blurb: string;
  tags: string[];
};

export const hostListings: HostListing[] = [
  { slug: "fancy-hill-cabin-1", name: "Fancy Hill Cabin 1", location: "Caddo Gap, Arkansas", type: "Cabin", sleeps: 6, bedrooms: 2, baths: 2, price: 169, image: properties[0].image, blurb: "A comfortable cabin near the Caddo River with a private outdoor area and room for a family weekend.", tags: ["Hot tub","Pet friendly","Fire pit","Wi-Fi"] },
  { slug: "fancy-hill-cabin-2", name: "Fancy Hill Cabin 2", location: "Caddo Gap, Arkansas", type: "Cabin", sleeps: 4, bedrooms: 1, baths: 1, price: 149, image: properties[1].image, blurb: "A smaller cabin for couples and small families with quick access to the river and nearby recreation.", tags: ["Pet friendly","Fire pit","Wi-Fi","Full kitchen"] },
  { slug: "whitetail-cabin", name: "Whitetail Cabin", location: "Caddo Gap, Arkansas", type: "Cabin", sleeps: 8, bedrooms: 3, baths: 2, price: 214, image: properties[4].image, blurb: "A roomy cabin set up for family trips, river weekends and groups that want a little more space.", tags: ["Hot tub","Fire pit","Wi-Fi","Full kitchen"] },
  { slug: "rv-site-4", name: "RV Site 4", location: "Caddo Gap, Arkansas", type: "RV Site", sleeps: 6, bedrooms: 0, baths: 1, price: 72, image: properties[7].image, blurb: "A full-hookup RV site with easy access and a simple home base for exploring the Caddo River area.", tags: ["Full hookup","Pet friendly","Wi-Fi","Big-rig friendly"] }
];
