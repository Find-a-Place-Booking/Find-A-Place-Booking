/** Limited, editorially curated destination pages; never create arbitrary
 * search-parameter URLs as indexable landing pages. */
export type DestinationPage = {
  slug: string;
  name: string;
  heading: string;
  description: string;
  intro: string;
  localFocus: string[];
  searchPlace: string;
  radiusMiles: 15 | 25 | 40 | 60;
  guideName?: string;
  guideUrl?: string;
};

export const DESTINATIONS: readonly DestinationPage[] = [
  {
    slug: "hot-springs-arkansas",
    name: "Hot Springs, Arkansas",
    heading: "Cabins and vacation stays near Hot Springs, Arkansas",
    description: "Browse independent cabins, cottages and vacation rentals near Hot Springs, Arkansas. Compare real host listings, photos and live booking dates.",
    intro: "Hot Springs works well as a base for lake days, trails, the historic downtown and a quiet cabin evening. Find A Place brings together independently hosted stays around the city and nearby Ouachita communities, so you can choose the spot that fits your trip rather than just the closest pin.",
    localFocus: ["Bathhouse Row and downtown Hot Springs", "Hot Springs National Park trails", "Lake Hamilton and nearby lake outings", "Ouachita foothills and cabin getaways"],
    searchPlace: "Hot Springs",
    radiusMiles: 40,
    guideName: "Hot Springs local travel guide",
    guideUrl: "https://www.hotspringsarkansas.org/",
  },
  {
    slug: "lake-ouachita",
    name: "Lake Ouachita",
    heading: "Cabins and places to stay near Lake Ouachita",
    description: "Find cabins, cottages and independent stays around Lake Ouachita, Arkansas, for time on the water, forest trails and quiet weekends.",
    intro: "A Lake Ouachita trip is usually about getting outside: swimming, fishing, paddling, hiking or simply being away from busy streets. The right base can be in the Mount Ida area, closer to Hot Springs or tucked into surrounding forest country. Check the actual listing location before choosing your dates.",
    localFocus: ["Lake Ouachita State Park", "Mount Ida and crystal country", "Brady Mountain and lake access", "Ouachita National Forest"],
    searchPlace: "Lake Ouachita",
    radiusMiles: 40,
    guideName: "Mount Ida and Lake Ouachita guide",
    guideUrl: "https://www.mountidaarkansas.org/",
  },
  {
    slug: "caddo-river",
    name: "Caddo River",
    heading: "Cabins and riverside stays near the Caddo River",
    description: "Explore independent cabins and places to stay near the Caddo River, Glenwood and Caddo Gap, Arkansas, with booking details from local hosts.",
    intro: "The Caddo River area is a favorite for a day on the water followed by an easy night at a cabin. Glenwood, Caddo Gap and the surrounding countryside offer different kinds of stays, from wooded retreats to places close to river outfitters. Compare the property details and route before booking.",
    localFocus: ["Caddo River floating and paddling", "Glenwood and Caddo Gap", "Short drives into the Ouachita Mountains", "Quiet cabins after a river day"],
    searchPlace: "Caddo River",
    radiusMiles: 25,
    guideName: "Glenwood and Caddo River guide",
    guideUrl: "https://www.glenwoodarkansas.org/",
  },
  {
    slug: "buffalo-national-river",
    name: "Buffalo National River",
    heading: "Places to stay near the Buffalo National River",
    description: "Browse cabins, glamping and other independent stays near Buffalo National River access areas, with a carefully limited nearby search.",
    intro: "The Buffalo National River stretches across northern Arkansas, so picking your section matters. A place near one river access point may be a long drive from another. These listings are matched to the river's mapped access areas, not to one broad county label.",
    localFocus: ["River access, paddling and floating", "Bluffs, trails and scenic overlooks", "Jasper and Buffalo River country", "Planning your route to the right river section"],
    searchPlace: "Buffalo National River",
    radiusMiles: 15,
  },
  {
    slug: "jasper-arkansas",
    name: "Jasper, Arkansas",
    heading: "Cabins and stays around Jasper, Arkansas",
    description: "Find independently hosted cabins and vacation stays near Jasper, Arkansas, for Buffalo River trips, mountain scenery and Ozark weekends.",
    intro: "Jasper sits in the Ozark mountain country that draws visitors for trails, scenic drives and Buffalo River days. Look beyond the town limits when comparing places to stay: travel times vary considerably on mountain roads, even when two cabins look close on a map.",
    localFocus: ["Upper Buffalo River day trips", "Ozark hiking and overlooks", "Scenic drives through Newton County", "Rustic cabins and quiet mountain stays"],
    searchPlace: "Jasper",
    radiusMiles: 25,
  },
  {
    slug: "mammoth-spring-arkansas",
    name: "Mammoth Spring, Arkansas",
    heading: "Cabins and getaways near Mammoth Spring, Arkansas",
    description: "Compare independent cabins, cottages, river stays and RV spots around Mammoth Spring and the Spring River in northern Arkansas.",
    intro: "Mammoth Spring is a base for Spring River outings, small-town exploring and relaxed weekends. This area has a mix of cabins, cottages and river-oriented stays, so checking the amenities and exact host notes can be as useful as comparing the starting nightly rate.",
    localFocus: ["Mammoth Spring State Park", "Spring River outdoor trips", "Small-town northern Arkansas", "Cabins, cottages and RV accommodation"],
    searchPlace: "Mammoth Spring",
    radiusMiles: 25,
  },
];

export function getDestination(slug: string) {
  return DESTINATIONS.find((item) => item.slug === slug);
}
