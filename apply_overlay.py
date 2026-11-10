#!/usr/bin/env python3
"""Safe, all-or-nothing source overlay for FAP Buffalo River / Luxury stays.

Place in the root of Find-A-Place-Booking, run using Python 3, and check
`npm run typecheck && npm run build` before pushing.
"""
from __future__ import annotations

import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CHANGED: dict[str, str] = {}


def replace_once(source: str, old: str, new: str, file: str) -> str:
    if source.count(old) != 1:
        raise RuntimeError(
            f"{file}: expected exactly one known anchor, found {source.count(old)}. "
            "Source may differ from 2026-11-09 GitHub main. No files have been modified."
        )
    return source.replace(old, new, 1)


def stage(file: str, transform):
    path = ROOT / file
    if not path.is_file():
        raise RuntimeError(f"Missing {file}. Unzip this overlay in the repository root (next to package.json).")
    current = path.read_text(encoding="utf-8")
    updated = transform(current)
    if updated != current:
        CHANGED[file] = updated


def patch_buffalo(source: str) -> str:
    file = 'lib/public/buffalo-river-discovery.ts'
    if 'export const BUFFALO_RIVER_MAX_DISTANCE_MILES = 20;' in source:
        return source  # repeat application is safe
    source = replace_once(
        source,
        'import { propertyMatchesDestination, type Property } from "@/data/catalog";',
        'import type { Property } from "@/data/catalog";',
        file,
    )
    old_points = '''// Official NPS campground/access coordinates, not private property locations.
// The river has three districts, and Jasper alone cannot represent all of them.
const ACCESS_POINTS = [
  { lat: 36.0407758042, lng: -93.344048343 }, // Steel Creek / upper
  { lat: 35.9867152274, lng: -92.7639029014 }, // Tyler Bend / middle
  { lat: 36.0853650144, lng: -92.5656548749 }, // Buffalo Point / lower
];'''
    new_points = '''// Public NPS access/campground coordinates, not private-property addresses.
// Distribute reference points along the river: three distant centers missed
// nearby cabins in between, and text-only matches included distant properties.
// https://www.nps.gov/buff/planyourvisit/getting-around.htm
export const BUFFALO_RIVER_MAX_DISTANCE_MILES = 20;
const ACCESS_POINTS = [
  { lat: 36.0215842559, lng: -93.3543809402 }, // Ponca trail / upper
  { lat: 36.0407758042, lng: -93.344048343 }, // Steel Creek
  { lat: 36.0557562676, lng: -93.2812997285 }, // Kyles Landing
  { lat: 36.0734393674, lng: -93.2177325784 }, // Erbie
  { lat: 36.0621316711, lng: -93.1597244134 }, // Ozark
  { lat: 36.0576658302, lng: -93.1350316289 }, // Pruitt launch
  { lat: 35.9851823163, lng: -93.0381867299 }, // Carver
  { lat: 35.972112684, lng: -92.8819327253 }, // Woolum
  { lat: 35.9867152274, lng: -92.7639029014 }, // Tyler Bend
  { lat: 35.9877379907, lng: -92.7155625076 }, // Gilbert trail
  { lat: 36.0394107175, lng: -92.6299021406 }, // South Maumee
  { lat: 36.028528897, lng: -92.5800834506 }, // Spring Creek
  { lat: 36.0853650144, lng: -92.5656548749 }, // Buffalo Point
  { lat: 36.1228757113, lng: -92.5507485263 }, // Rush / lower
];

// Fallback only for properties lacking a usable public map coordinate.
// Exact locations avoid accidentally matching "Ozark Mountains" or distant
// properties that happen to mention the Buffalo River in marketing copy.
const BUFFALO_RIVER_COMMUNITIES = new Set([
  "ponca", "boxley", "compton", "jasper", "hasty", "pruitt", "carver",
  "mt judea", "mount judea", "gilbert", "st joe", "saint joe", "marshall",
  "harriet", "woolum", "yellville", "western grove", "pindall",
  "erbie", "ozark", "bass", "maumee", "tyler bend",
]);

function nearRiverByNamedCommunity(property: Property) {
  const state = normalize(property.state);
  if (state && state !== "ar" && state !== "arkansas") return false;
  const city = normalize(property.city).replace(/\\s+(ar|ark|arkansas)$/, "");
  if (BUFFALO_RIVER_COMMUNITIES.has(city)) return true;
  const location = normalize(property.location);
  return location === "buffalo river" || location === "buffalo national river"
    || location === "buffalo river country";
}'''
    source = replace_once(source, old_points, new_points, file)
    old_function = '''export function searchBuffaloRiverStays(properties: Property[], destination: string, radiusMiles: number): Property[] {
  const radius = Number.isFinite(radiusMiles) ? Math.max(0, Math.min(100, radiusMiles)) : 40;
  return properties.flatMap((property) => {
    const direct = propertyMatchesDestination(property, destination);
    const distance = validCoordinate(property.lat, property.lng)
      ? Math.min(...ACCESS_POINTS.map((point) => milesBetween(point, property))) : Infinity;
    return direct || distance <= radius ? [{property,distance,direct}] : [];
  }).sort((a,b) => a.distance - b.distance || Number(b.direct) - Number(a.direct))
    .map(({property}) => property);
}'''
    new_function = '''export function searchBuffaloRiverStays(properties: Property[], _destination: string, radiusMiles: number): Property[] {
  // For this collection, proximity to the Buffalo is mandatory; the general
  // search radius cannot make unrelated towns part of the river collection.
  const radius = Number.isFinite(radiusMiles)
    ? Math.max(0, Math.min(BUFFALO_RIVER_MAX_DISTANCE_MILES, radiusMiles))
    : BUFFALO_RIVER_MAX_DISTANCE_MILES;

  return properties.flatMap((property) => {
    const mapped = validCoordinate(property.lat, property.lng);
    if (!mapped && !nearRiverByNamedCommunity(property)) return [];
    const distance = mapped
      ? Math.min(...ACCESS_POINTS.map((point) => milesBetween(point, property)))
      : Infinity;
    return distance <= radius || (!mapped && nearRiverByNamedCommunity(property))
      ? [{ property, distance }]
      : [];
  }).sort((a, b) => a.distance - b.distance)
    .map(({ property }) => property);
}'''
    return replace_once(source, old_function, new_function, file)


def patch_categories(source: str) -> str:
    file = 'lib/public/discovery-categories.ts'
    if 'export function isLuxuryStay' in source:
        return source
    anchor = 'type DiscoveryStay = Pick<Property, "type" | "name" | "tags" | "sleeps">;'
    addition = '''type DiscoveryStay = Pick<Property, "type" | "name" | "tags" | "sleeps">;
type LuxuryStay = Pick<Property, "type" | "name" | "tags" | "price">;

/** This collection is intentionally a higher-priced tier, not "unusual" stays. */
export const LUXURY_MIN_NIGHTLY_PRICE = 300;

export function isLuxuryStay(stay: LuxuryStay): boolean {
  if (!Number.isFinite(stay.price) || stay.price < LUXURY_MIN_NIGHTLY_PRICE) return false;
  const type = normalized(stay.type);
  const name = normalized(stay.name);
  if (/\\brv\\b|camp|tent|\\bsite\\b/.test(type) || /\\b(rv site|camping site|tent site)\\b/.test(name)) {
    return false;
  }
  if (type === "other") {
    // Some luxury homes use "Other" as a property type. Require a clear
    // property label before including them solely for being expensive.
    return (stay.tags || []).some((tag) => ["luxury", "luxury stay", "premium stay", "luxury cabin"].includes(normalized(tag)));
  }
  return true;
}'''
    return replace_once(source, anchor, addition, file)


def patch_home(source: str) -> str:
    file = 'app/page.tsx'
    old = '''    label: "Unique stays",
    detail: "Glamping, tiny homes and stays that are a little different.",
    filter: "Unique stays",'''
    new = '''    label: "Luxury stays",
    detail: "High-end cabins and standout retreats from $300 a night.",
    filter: "Luxury stays",'''
    if new in source:
        return source
    return replace_once(source, old, new, file)


def patch_stays(source: str) -> str:
    file = 'app/stays/page.tsx'
    if 'const requestedFilter = params.filter === "Unique stays" ? "Luxury stays" : params.filter;' in source:
        return source
    source = replace_once(
        source,
        'import { normalizeSearchRadiusMiles, searchPublishedStaysNearby } from "@/lib/public/nearby-destination-search";',
        'import { normalizeSearchRadiusMiles, searchPublishedStaysNearby } from "@/lib/public/nearby-destination-search";\nimport { BUFFALO_RIVER_MAX_DISTANCE_MILES, isBuffaloRiverSearch } from "@/lib/public/buffalo-river-discovery";',
        file,
    )
    source = replace_once(
        source,
        '  "Unique stays": "One-of-a-kind stays",',
        '  "Luxury stays": "Luxury cabins and premium stays",',
        file,
    )
    source = replace_once(
        source,
        '''  const initialFilter =
    params.filter && collectionHeadings[params.filter] ? params.filter : "";''',
        '''  // Old shared Unique stays URLs keep working, but open the new collection.
  const requestedFilter = params.filter === "Unique stays" ? "Luxury stays" : params.filter;
  const initialFilter =
    requestedFilter && collectionHeadings[requestedFilter] ? requestedFilter : "";''',
        file,
    )
    source = replace_once(
        source,
        '  const buffaloRiverSearch = /^(buffalo( national)? river( country| area)?)$/i.test(where.trim());',
        '  const buffaloRiverSearch = isBuffaloRiverSearch(where) || initialFilter === "Buffalo National River";',
        file,
    )
    source = replace_once(
        source,
        '''                {search.usedNearby
                  ? buffaloRiverSearch
                    ? ` Search covers stays roughly ${radius} miles from several access areas along the Buffalo National River; distances are approximate.`
                    : ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`
                  : null}''',
        '''                {buffaloRiverSearch
                  ? ` Buffalo River stays are within roughly ${Math.min(radius, BUFFALO_RIVER_MAX_DISTANCE_MILES)} straight-line miles of park access points; actual drives may be longer.`
                  : search.usedNearby
                    ? ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`
                    : null}''',
        file,
    )
    return source


def patch_results(source: str) -> str:
    file = 'components/StayResults.tsx'
    if 'if (filter === "Luxury stays") return isLuxuryStay(property);' in source:
        return source
    source = replace_once(
        source,
        'import { isLargeGroupStay, isUniqueStay } from "@/lib/public/discovery-categories";',
        'import { isLargeGroupStay, isLuxuryStay } from "@/lib/public/discovery-categories";',
        file,
    )
    source = replace_once(source, '  "Unique stays",', '  "Luxury stays",', file)
    source = replace_once(
        source,
        '    if (filter === "Unique stays") return isUniqueStay(property);',
        '    if (filter === "Luxury stays") return isLuxuryStay(property);',
        file,
    ) if '    if (filter === "Unique stays") return isUniqueStay(property);' in source else replace_once(
        source,
        '        if (filter === "Unique stays") return isUniqueStay(property);',
        '        if (filter === "Luxury stays") return isLuxuryStay(property);',
        file,
    )
    source = replace_once(
        source,
        '''            saved.filters.filter((filter) => filterOptions.includes(filter)),''',
        '''            saved.filters
              .map((filter) => filter === "Unique stays" ? "Luxury stays" : filter)
              .filter((filter) => filterOptions.includes(filter)),''',
        file,
    )
    return source


def patch_tests(source: str) -> str:
    file = 'tests/test_discovery.cjs'
    if 'isLuxuryStay' in source:
        return source
    source = replace_once(
        source,
        '''const {isUniqueStay,isLargeGroupStay}=loadTS('lib/public/discovery-categories.ts');''',
        '''const {isUniqueStay,isLargeGroupStay,isLuxuryStay}=loadTS('lib/public/discovery-categories.ts');''',
        file,
    )
    source = replace_once(
        source,
        '''assert.equal(isLargeGroupStay(mk('Cabin',7)),false);''',
        '''assert.equal(isLargeGroupStay(mk('Cabin',7)),false);
assert.equal(isLuxuryStay({...mk('Cabin',4),price:299}),false);
assert.equal(isLuxuryStay({...mk('Cabin',4),price:300}),true);
assert.equal(isLuxuryStay({...mk('House',8),price:450}),true);
assert.equal(isLuxuryStay({...mk('RV Site',2),price:900}),false);
assert.equal(isLuxuryStay({...mk('Other',2),price:500}),false);
assert.equal(isLuxuryStay({...mk('Other',2,'Hilltop Escape',['luxury']),price:500}),true);''',
        file,
    )
    source = replace_once(
        source,
        ''' const test=[p('upper',36.041,-93.345),p('middle',35.987,-92.763),p('lower',36.085,-92.566)''',
        ''' const test=[p('upper',36.041,-93.345),p('between-upper',36.073,-93.218),p('middle',35.987,-92.763),p('lower',36.085,-92.566)''',
        file,
    )
    source = replace_once(
        source,
        ''' assert.deepEqual(Array.from(result,r=>r.slug).sort(),['lower','middle','upper']);''',
        ''' assert.deepEqual(Array.from(result,r=>r.slug).sort(),['between-upper','lower','middle','upper']);''',
        file,
    )
    source = replace_once(source, ''' assert.equal(small.length,3);''', ''' assert.equal(small.length,4);
 const marketedFar = {...p('marketed-far',34.5,-93.1,'Buffalo National River'),location:'Buffalo National River'};
 assert.equal(nearby.searchBuffaloRiverStays([marketedFar],'Buffalo River',100).length,0);
 assert.equal(nearby.searchBuffaloRiverStays([p('eureka',36.4,-93.74,'Eureka Springs')],'Buffalo River',100).length,0);
 assert.equal(nearby.searchBuffaloRiverStays([p('no-coords-near',0,0,'Jasper, AR')],'Buffalo River',20).length,1);
 assert.equal(nearby.searchBuffaloRiverStays([p('no-coords-far',0,0,'Eureka Springs')],'Buffalo River',20).length,0);
 assert.equal(nearby.BUFFALO_RIVER_MAX_DISTANCE_MILES,20);''', file)
    source = replace_once(
        source,
        '''for (const label of ['Buffalo National River','Unique stays','Group getaways'])''',
        '''for (const label of ['Buffalo National River','Luxury stays','Group getaways'])''',
        file,
    )
    source = replace_once(
        source,
        '''for (const label of ['Buffalo National River','Unique stays','Sleeps 8+'])''',
        '''for (const label of ['Buffalo National River','Luxury stays','Sleeps 8+'])''',
        file,
    )
    source += '''\nassert.ok(staysPage.includes('params.filter === "Unique stays" ? "Luxury stays"'), 'Old shared URLs must map to Luxury stays');\n'''
    return source


def main():
    if not (ROOT / "package.json").is_file():
        raise RuntimeError("Unzip this ZIP into your FAP repository root, alongside package.json, then run APPLY_OVERLAY.bat")
    stage('lib/public/buffalo-river-discovery.ts', patch_buffalo)
    stage('lib/public/discovery-categories.ts', patch_categories)
    stage('app/page.tsx', patch_home)
    stage('app/stays/page.tsx', patch_stays)
    stage('components/StayResults.tsx', patch_results)
    stage('tests/test_discovery.cjs', patch_tests)
    if not CHANGED:
        print("Already applied. No files changed.")
        return

    backup_dir = ROOT.parent / f"{ROOT.name}_FAP_backup_{datetime.now():%Y%m%d_%H%M%S}"
    backup_dir.mkdir(exist_ok=False)
    for rel in CHANGED:
        dest = backup_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dest)

    for rel, content in CHANGED.items():
        (ROOT / rel).write_text(content, encoding="utf-8", newline="")
    print(f"Changed {len(CHANGED)} files:")
    for rel in CHANGED:
        print(f"  {rel}")
    print(f"Originals backed up OUTSIDE repository: {backup_dir}")
    print("Next run: npm run typecheck, then npm run build, then node tests/test_discovery.cjs")
    print("This patch does not edit payments, calendars, booking inventory, or live production.")


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f"PATCH ABORTED: {error}", file=sys.stderr)
        sys.exit(1)
