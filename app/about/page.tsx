import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DeferredBackgroundVideo } from "@/components/DeferredBackgroundVideo";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getSiteContentBlocks } from "@/lib/public/site-content";

import styles from "./about-map.module.css";

export const metadata: Metadata = {
  title: "Who We Are / What We Do | Find A Place",
  description:
    "Meet the Find A Place Arkansas & Beyond collaboration network and the outdoor creators, hosts and team members behind Find A Place Booking.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "Who We Are / What We Do | Find A Place",
    description:
      "Meet the Find A Place Arkansas & Beyond collaboration network and the team behind Find A Place Booking.",
    url: "/about",
  },
};

type TeamMember = {
  contentKey: string;
  name: string;
  subtitle: string;
  image?: string;
  imageAlt: string;
  bio: string;
  href?: string;
  linkLabel?: string;
  featured?: boolean;
};

const teamMemberDefaults: TeamMember[] = [
  {
    contentKey: "about.team.renea-jon",
    name: "Renea and Jon",
    subtitle: '"Renea and Jon Travels" · "Explore, Stay, Adventure, Repeat"',
    image: "/about/team/renea-jon.webp",
    imageAlt: "Renea and Jon outdoors",
    href: "https://linktr.ee/explorestayadventurerepeat",
    linkLabel: "Links",
    featured: true,
    bio:
      "Renea is a short-term rental property owner, is very active within many multi-state social media groups, and has a complete understanding of the short-term rental business. She owns and operates Fancy Hill Cabins and RV Park LLC and runs her own travel blog Renea's and Jon's Travels & Explore.Stay.Adventure.Repeat. She also handles our group pages and is the guru of all things behind the scenes at Find A Place, Famous Jon and Renea inspire to help others to step out side find their adventure and always support local business.",
  },
  {
    contentKey: "about.team.mike",
    name: "Mike",
    subtitle: '"Van Muir - For Life Outdoors"',
    image: "/about/team/mike.webp",
    imageAlt: "Mike from Van Muir - For Life Outdoors",
    href: "https://www.facebook.com/share/VWpwtLCyoK5ptN2T/?mibextid=qi2Omg",
    linkLabel: "Facebook",
    bio:
      "Mike has a passion for the outdoors and design work and has a nationwide ambassadorial network of outdoors artists.",
  },
  {
    contentKey: "about.team.chad",
    name: "Chad",
    subtitle: '"Chasing the Ozarks"',
    image: "/about/team/chad.webp",
    imageAlt: "Chad from Chasing the Ozarks at a waterfall",
    href: "https://www.facebook.com/profile.php?id=100069507084422",
    linkLabel: "Facebook",
    bio:
      "Chad is an avid Ozarks (and beyond!) hiker and creates some high quality shots and drone video clips of his hiking adventures.",
  },
  {
    contentKey: "about.team.gez",
    name: "Gez",
    subtitle: '"Waterfalls in Arkansas and Other Cool Places"',
    image: "/about/team/gez.webp",
    imageAlt: "Gez outdoors with Super Leeds",
    href: "https://www.facebook.com/share/C4tN9CYvBxzviVDL/?mibextid=qi2Omg",
    linkLabel: "Facebook",
    bio:
      "Gez is a dedicated waterfall chaser, has authored a comprehensive map of Waterfalls in AR, and his 4-legged companion “Super Leeds” is the USFS (Ozark & Ouachita National Forests) Pet of the year for 2023.",
  },
  {
    contentKey: "about.team.joey",
    name: "Joey",
    subtitle: '"Adventure Arkansas"',
    image: "/about/team/joey.webp",
    imageAlt: "Joey from Adventure Arkansas near a waterfall",
    href: "https://www.facebook.com/share/NrMUmJCi62NHnBNb/?mibextid=qi2Omg",
    linkLabel: "Facebook",
    bio:
      "Joey is the face behind the social media page Adventure Arkansas and the group Bridges of Arkansas. He and his wife travel all four corners of Arkansas frequently and document their travels.",
  },
  {
    contentKey: "about.team.marcus",
    name: "Marcus",
    subtitle: '"Floating the Ozarks"',
    image: "/about/team/marcus.webp",
    imageAlt: "Marcus from Floating the Ozarks on the river",
    href: "https://www.facebook.com/share/Pd7AhmJB6vnzDkEh/?mibextid=qi2Omg",
    linkLabel: "Facebook",
    bio:
      "Marcus is the face behind the Floating the Ozarks page and is an avid floater & camper and he will be significant in helping us as we expand our roots further into southern Missouri.",
  },
  {
    contentKey: "about.team.tammy",
    name: "Tammy",
    subtitle: '"Arkansas Sole Sisters Hiking Group"',
    image: "/about/team/tammy.webp",
    imageAlt: "Tammy from Arkansas Sole Sisters Hiking Group",
    href: "https://www.facebook.com/groups/2986082785014036",
    linkLabel: "Facebook",
    bio:
      "Tammy is the founder of Arkansas Sole Sisters Hiking Group, In 2021 Arkansas Sole Sisters took their first hike, now many adventures later this hiking group inspires to help women build friendships, lift each other up as well as create an atmosphere of empowerment, all while going on fun filled adventures exploring the beautiful state.",
  },
  {
    contentKey: "about.team.aaron",
    name: "Aaron",
    subtitle: "Vinci Snaps",
    image: "/about/team/aaron.webp",
    imageAlt: "Night sky photography by Aaron of Vinci Snaps",
    href: "https://www.facebook.com/share/1Jb7jCgcFw/",
    linkLabel: "Facebook",
    bio:
      "Aaron is the founder of Vinci Snaps. He has a passion for hiking and all things night sky photography, and his work is absolutely stunning!",
  },
  {
    contentKey: "about.team.hilary",
    name: "Hilary",
    subtitle: '"Explore MO*AR"',
    image: "/about/team/hilary.webp",
    imageAlt: "Hilary from Explore MO*AR",
    href: "https://www.facebook.com/share/18ZtzPzvki/?mibextid=qi2Omg",
    linkLabel: "Facebook",
    bio:
      "Hilary is the founder of Explore MOAR. She has a passion for hiking, waterfalls, and scenic views, often traveling Southern MO and much of the Ozarks. AND she often travels with Chad with Chasing the Ozarks her partner in crime.",
  },
  {
    contentKey: "about.team.ben",
    name: "Ben",
    subtitle: '"VP of Behind the Scenes" · Marketing Coordinator',
    image: "/about/team/ben.webp",
    imageAlt: "Ben, Find A Place marketing coordinator",
    href: "https://www.facebook.com/share/19vCnpE2Ry/",
    linkLabel: "Facebook",
    bio:
      "Ben will be spearheading many tasks behind the scenes for us. He is very fluent in social media and website automation and will be our marketing coordinator behind the scenes.",
  },
  {
    contentKey: "about.team.jake",
    name: "Jake",
    subtitle: "Platform Development & Technology",
    image: "/about/team/jake.webp",
    imageAlt: "Jake, Find A Place platform development and technology",
    href: "https://www.hometownwebservicesar.com",
    linkLabel: "Website",
    bio:
      "Jake handles platform development and technology for Find A Place, building and maintaining the booking experience and the tools that support hosts, guests and the Find A Place team behind the scenes.",
  },
  {
    contentKey: "about.team.lobo",
    name: "Lobo",
    subtitle: '"Arkansas Outdoors"',
    image: "/about/team/lobo.webp",
    imageAlt: "Lobo from Arkansas Outdoors on a hike",
    href: "https://www.facebook.com/share/18aUoQUs4F/",
    linkLabel: "Facebook",
    bio:
      "Lobo is the face behind Arkansas Outdoors. His connection to nature started early and has only grown stronger with time. From camping and hiking to chasing waterfalls, exploring rivers, learning about plants and wildlife, and even guiding zipline adventures, the outdoors has always been at the heart of who he is. Today he shares his experiences to inspire others to get outside, connect with nature, and discover all it has to offer.",
  },
  {
    contentKey: "about.team.ricky-tiffany",
    name: "Ricky and Tiffany",
    subtitle: "Ozarks Uncovered",
    image: "/about/team/ricky-tiffany.webp",
    imageAlt: "Ricky and Tiffany from Ozarks Uncovered",
    href: "https://www.facebook.com/share/1DC3gfuWs4/",
    linkLabel: "Facebook",
    bio:
      "Ricky and Tiffany together make Ozarks Uncovered. Based over in the heart of the Missouri Ozarks, their passion is uncovering and sharing the incredible rugged beauty of the region.",
  },
  {
    contentKey: "about.team.ashley",
    name: "Ashley",
    subtitle: '"Arkansas Trail Diaries"',
    image: "/about/team/ashley.webp",
    imageAlt: "Ashley from Arkansas Trail Diaries",
    href: "https://www.facebook.com/profile.php?id=61580335089451",
    linkLabel: "Facebook",
    bio:
      "Ashley is the face behind Arkansas Trail Diaries and is passionate about hiking and nature. Her hope is to inspire other to explore, learn about, and help protect the outdoors and everything the Natural State has to offer.",
  },
  {
    contentKey: "about.team.mccarley",
    name: "McCarley",
    subtitle: '"McCarley Explores"',
    image: "/about/team/mccarley.webp",
    imageAlt: "McCarley from McCarley Explores",
    href: "https://www.tiktok.com/@mccarley.explores?_r=1&_t=ZP-99P98pNC8qt",
    linkLabel: "TikTok",
    bio:
      'McCarley is a Huntsville, Alabama based content creator with a love for road trips and finding places that make you say, "How did I not know this was here?"',
  },
];

const historyDefaults = [
  'Founding collaborators are Renea with "Renea and Jon\'s Travels", Mike with “Van Muir - For Life Outdoors”, Chad with “Chasing The Ozarks” and Gez with “Waterfalls in AR & Other Cool Places”.',
  'In June 2024 we welcomed Joey Hunter with the "Adventure Arkansas" page and "Bridges of Arkansas" Group aboard the Find A Place Arkansas team.',
  'In September 2024 we invited Marcus Allen with the "Floating the Ozarks" page.',
  'In October 2024, Tammy Bradley from the "Arkansas Sole Sisters Group" joined our collaboration.',
  'In January 2025, Aaron with Vinci Snaps joined our team.',
  'In February 2025, Hilary with "Explore MO*AR" and Ben our "VP of Behind the Scenes" or Marketing Coordinator joined the Find A Place Team.',
  'In May 2026, Lobo with the Arkansas Outdoors page joined the Find A Place Team.',
  'In July 2026, Ozarks Uncovered and Arkansas Trail Diaries joined the Find A Place Team.',
  'In September, McCarley Norway joined the Find A Place Team.',
];

const pageDefaults = {
  "about.network_hero": {
    eyebrow: "Unforgettable Stays. Exceptional Adventures.",
    title: "Find A Place Arkansas & Beyond Collaboration Network",
    body: "Find A Place Arkansas & Beyond - Who We Are/What We Do",
  },
  "about.featured": {
    eyebrow: "",
    title: "Find a stay. Find the adventure around it.",
    body: "Cabins, campgrounds, lake stays, unique stays and RV spots close to the adventure.",
  },
  "about.history": {
    eyebrow: "Our story",
    title: "How the Find A Place team grew.",
    body: historyDefaults.join("\n\n"),
  },
  "about.following": {
    eyebrow: "",
    title: "Our combined reach",
    body: "Collectively across all our platforms, we have a social media following of great outdoor enthusiast!",
  },
  "about.booking_bridge": {
    eyebrow: "The network today",
    title: "The same outdoor community, now connected to booking.",
    body:
      "The original Find A Place network was built around short-term rentals and the outdoorsy things to see and do around them. Find A Place Booking carries that idea forward by giving travelers a place to discover and book independent stays while keeping the people, places and adventures behind the network at the center of it.",
  },
  "about.team_intro": {
    eyebrow: "Team Find A Place",
    title: "Meet the people behind the network.",
    body:
      "Outdoor creators, travelers, a short-term rental owner, marketing and technology working together around the places people want to explore.",
  },
  "about.map_intro": {
    eyebrow: "Across the Find A Place network",
    title: "See where our partners are.",
    body:
      "Find A Place started by connecting travelers with local stays and outdoor destinations across Arkansas. This map shows the partner locations that make up that growing network.",
  },
  "about.who": {
    eyebrow: "Who we are",
    title: "A travel and outdoor network built close to home.",
    body:
      "We are a social media / blogger collaborative network, established to promote great places to stay in AR. We look to support cabins & campgrounds that are located within reasonable proximity of the places we love to explore.",
  },
  "about.what": {
    eyebrow: "What we do",
    title: "We help people find the stay that fits the adventure.",
    body:
      "Our initial focus is short-term property rentals combined with the outdoorsy things to see and do in the area, carrying that same community-first approach into Find A Place Booking.",
  },
  "about.community": {
    eyebrow: "Why we do it",
    title: "It was always about the experience!",
    body:
      "Find A Place has always been about more than a property listing. It is about the hike, the float, the trail, the waterfall, the small town stores and eats, and the great places people stay along the way.",
  },
  "about.hosts": {
    eyebrow: "For hosts",
    title: "Independent places deserve a better way to be found.",
    body:
      "Find A Place Booking connects independent stays with travelers already planning the trip, while keeping the outdoor-community roots that built the Find A Place network in the first place.",
  },
};

function copyParagraphs(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default async function AboutPage() {
  const keys = [
    ...Object.keys(pageDefaults),
    ...teamMemberDefaults.map((member) => member.contentKey),
  ];
  const content = await getSiteContentBlocks(keys);

  const get = (key: keyof typeof pageDefaults) => ({
    ...pageDefaults[key],
    ...(content.get(key) ?? {}),
  });

  const networkHero = get("about.network_hero");
  const featured = get("about.featured");
  const history = get("about.history");
  const following = get("about.following");
  const who = get("about.who");
  const what = get("about.what");
  const community = get("about.community");
  const bookingBridge = get("about.booking_bridge");
  const teamIntro = get("about.team_intro");
  const mapIntro = get("about.map_intro");
  const hosts = get("about.hosts");

  const teamMembers = teamMemberDefaults.map((member) => {
    const block = content.get(member.contentKey);
    return {
      ...member,
      name: block?.title || member.name,
      subtitle: block?.eyebrow || member.subtitle,
      bio: block?.body || member.bio,
    };
  });

  return (
    <>
      <div className={`home-hero ${styles.aboutHero}`}>
        <DeferredBackgroundVideo
          className={styles.aboutHeroVideo}
          src="/media/find-a-place-about-fall-remix.mp4"
          poster="/media/find-a-place-about-fall-poster.jpg"
        />
        <div className={styles.aboutHeroShade} aria-hidden="true" />

        <Header light />
        <div className={`shell hero-layout ${styles.aboutHeroContent}`}>
          <div className="hero-copy">
            <p className="eyebrow">{networkHero.eyebrow}</p>
            <h1>{networkHero.title}</h1>
            <p className="hero-lead">{networkHero.body}</p>
          </div>

          <div className={`hero-featured-panel ${styles.heroSealPanel}`}>
            <div className={`hero-featured-media ${styles.heroSealMedia}`}>
              <Image
                src="/about/team/find-a-place-seal-black.webp"
                alt="Find A Place Arkansas & Beyond"
                width={720}
                height={720}
                priority
              />
            </div>
            <div className="hero-featured-copy">
              <strong>{featured.title}</strong>
              <p>{featured.body}</p>
            </div>
          </div>
        </div>
      </div>

      <main>
        <section className={styles.storySection}>
          <div className={`shell ${styles.storyGrid}`}>
            <div className={styles.storyHeading}>
              <p className="eyebrow dark">{who.eyebrow}</p>
              <h2>{who.title}</h2>
            </div>

            <div className={styles.storyCopy}>
              {copyParagraphs(who.body).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}

              <div>
                <p className="eyebrow dark">{what.eyebrow}</p>
                <h3>{what.title}</h3>
                {copyParagraphs(what.body).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div>
                <p className="eyebrow dark">{community.eyebrow}</p>
                <h3>{community.title}</h3>
                {copyParagraphs(community.body).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div>
                <p className="eyebrow dark">{history.eyebrow}</p>
                <h3>{history.title}</h3>
                <div className={styles.historyList}>
                  {copyParagraphs(history.body).map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>

              <p className={styles.followingLine}>{following.body}</p>
            </div>
          </div>
        </section>

        <section className={styles.bookingBridgeSection}>
          <div className={`shell ${styles.bookingBridge}`}>
            <div>
              <p className="eyebrow dark">{bookingBridge.eyebrow}</p>
              <h2>{bookingBridge.title}</h2>
            </div>
            <div>
              {copyParagraphs(bookingBridge.body).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <Link className="button button-small" href="/stays">
                Browse stays →
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.teamSection}>
          <div className="shell">
            <div className={styles.teamIntro}>
              <div>
                <p className="eyebrow dark">{teamIntro.eyebrow}</p>
                <h2>{teamIntro.title}</h2>
              </div>
              <p>{teamIntro.body}</p>
            </div>

            <div className={styles.teamGrid}>
              {teamMembers.map((member) => (
                <article
                  className={`${styles.teamCard} ${member.featured ? styles.teamCardFeatured : ""}`}
                  key={member.contentKey}
                >
                  <div className={styles.teamPhoto}>
                    {member.image ? (
                      <Image
                        src={member.image}
                        alt={member.imageAlt}
                        fill
                        sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                      />
                    ) : (
                      <div className={styles.teamPhotoPlaceholder}>
                        <Image
                          src="/about/team/find-a-place-seal-black.webp"
                          alt={member.imageAlt}
                          width={420}
                          height={420}
                        />
                      </div>
                    )}
                  </div>

                  <div className={styles.teamCardBody}>
                    <div>
                      <h3>{member.name}</h3>
                      <p className={styles.teamSubtitle}>{member.subtitle}</p>
                    </div>
                    <p className={styles.teamBio}>{member.bio}</p>
                    {member.href ? (
                      <a
                        className={styles.teamLink}
                        href={member.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {member.linkLabel ?? "Visit page"} →
                      </a>
                    ) : (
                      <span className={styles.teamLinkMuted}>Find A Place team</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.partnerMapSection}>
          <div className="shell">
            <div className={styles.partnerMapHeading}>
              <div>
                <p className="eyebrow dark">{mapIntro.eyebrow}</p>
                <h2>{mapIntro.title}</h2>
              </div>
              <p>{mapIntro.body}</p>
            </div>

            <div className={styles.partnerMapFrame}>
              <iframe
                title="Find A Place partner locations"
                src="https://www.google.com/maps/d/u/0/embed?mid=1znr--DZK2UInog1toBsweyTKqHtFPnU"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>

            <div className={styles.partnerMapFooter}>
              <span>
                Partner locations are maintained by Find A Place in Google My Maps.
              </span>
              <a
                href="https://www.google.com/maps/d/u/0/viewer?mid=1znr--DZK2UInog1toBsweyTKqHtFPnU"
                target="_blank"
                rel="noreferrer"
              >
                Open full partner map →
              </a>
            </div>
          </div>
        </section>

        <section className="host-cta">
          <div className="shell host-cta-inner">
            <div>
              <p className="eyebrow">{hosts.eyebrow}</p>
              <h2>{hosts.title}</h2>
            </div>
            <div>
              <p>{hosts.body}</p>
              <Link className="button button-light" href="/hosts">
                List your property →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
