import Link from "next/link";
import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./experiences.module.css";

export const metadata: Metadata = {
  title: "Explore nearby experiences | Find A Place Booking",
  description:
    "Explore nearby activities, attractions and local places suggested by Find A Place hosts, then discover places to stay close to them.",
};
export const dynamic = "force-dynamic";

type ExperienceRow = {
  property_id: string;
  title: string;
  category: string | null;
  description: string | null;
};
type StayRow = {
  property_id: string;
  slug: string;
  name: string;
  city: string | null;
  region_code: string | null;
};
type StayLink = { slug: string; name: string; city: string };
type ExperienceGroup = {
  key: string;
  title: string;
  category: string;
  description: string;
  region: string;
  stays: StayLink[];
};

function normalize(value: string) {
  return value.toLocaleLowerCase("en-US").trim().replace(/\s+/g, " ");
}

async function getExperiences(): Promise<ExperienceGroup[]> {
  const admin = createAdminClient();
  const [nearby, published] = await Promise.all([
    admin.from("property_nearby_experiences")
      .select("property_id,title,category,description")
      .eq("is_active", true)
      .limit(1500),
    admin.rpc("public_listing_index"),
  ]);
  if (nearby.error || published.error) {
    console.error("[experiences] public directory could not load", {
      experiencesCode: nearby.error?.code,
      listingsCode: published.error?.code,
    });
    return [];
  }

  const stays = new Map<string, StayRow>();
  for (const stay of (published.data ?? []) as StayRow[]) {
    if (stay.property_id && stay.slug) stays.set(stay.property_id, stay);
  }
  const groups = new Map<string, ExperienceGroup>();
  for (const experience of (nearby.data ?? []) as ExperienceRow[]) {
    const stay = stays.get(experience.property_id);
    const title = experience.title?.trim();
    if (!stay || !title) continue; // Never feature activities from unpublished stays.
    const category = experience.category?.trim() || "Local attraction";
    const region = stay.region_code?.trim() || "";
    // Avoid grouping identically named activities across distant cities.
    // These are host recommendations, not claimed venue coordinates.
    const locality = stay.city?.trim() || "";
    const key = [normalize(title), normalize(category), normalize(locality), normalize(region)].join("|");
    let group = groups.get(key);
    if (!group) {
      group = {key, title, category, description: experience.description?.trim() || "", region: locality ? `Host area: ${locality}${region ? `, ${region}` : ""}` : region, stays: []};
      groups.set(key, group);
    }
    if (!group.description && experience.description?.trim()) group.description = experience.description.trim();
    if (!group.stays.some((linked) => linked.slug === stay.slug)) {
      group.stays.push({slug: stay.slug, name: stay.name, city: stay.city || ""});
    }
  }
  return [...groups.values()].sort((a,b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}

export default async function ExperiencesPage() {
  const experiences = await getExperiences();
  return (
    <>
      <Header />
      <main className={`shell ${styles.page}`}>
        <div className={styles.intro}>
          <p className="eyebrow dark">Discover more nearby</p>
          <h1>Experiences worth exploring</h1>
          <p>Local trails, attractions, food and things to do shared by our hosts. Pick something you want to explore and find a stay nearby.</p>
          <Link href="/stays" className="button button-outline">Browse all stays</Link>
        </div>
        {experiences.length ? (
          <div className={styles.grid}>
            {experiences.map((item) => (
              <article key={item.key} className={styles.card}>
                <small>{item.category}{item.region ? ` · ${item.region}` : ""}</small>
                <h2>{item.title}</h2>
                {item.description ? <p>{item.description}</p> : null}
                <div className={styles.linkList}>
                  <b>Find a place nearby</b>
                  {item.stays.slice(0, 4).map((stay) => (
                    <Link key={stay.slug} href={`/stays/${encodeURIComponent(stay.slug)}`}>
                      {stay.name}{stay.city ? ` · ${stay.city}` : ""}
                    </Link>
                  ))}
                  {item.stays.length > 4 ? <span>Plus {item.stays.length - 4} more nearby stays</span> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className={styles.empty}>
            <h2>Explore stays and local favorites</h2>
            <p>Nearby experiences are being updated. You can still browse destinations and view local recommendations on individual stay pages.</p>
            <Link href="/stays">Explore places to stay</Link>
          </section>
        )}
        <p className={styles.disclaimer}>These are local recommendations, not activities booked or sold through Find A Place. Hours, prices and availability are set by the individual venue or provider.</p>
      </main>
      <Footer />
    </>
  );
}
