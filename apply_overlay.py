#!/usr/bin/env python3
"""Install Find A Place targeted-search buttons and host resource links safely.

Replaces the earlier Discovery / Property Managers overlay. Compatible with
repositories that have either not run the earlier overlay or already ran it.
Every source edit is preflighted before writing any file.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import sys

REQUIRED = [
    "lib/public/discovery-categories.ts",
    "lib/public/buffalo-river-discovery.ts",
    "components/HostResourcesMenu.tsx",
    "components/HostResourcesMenu.module.css",
    "app/property-managers/page.tsx",
    "app/property-managers/property-managers.module.css",
]
SOURCE_FILES = [
    "data/catalog.ts",
    "app/page.tsx",
    "app/stays/page.tsx",
    "components/StayResults.tsx",
    "lib/public/nearby-destination-search.ts",
    "components/Header.tsx",
    "components/Footer.tsx",
]

class PatchMismatch(Exception):
    pass


def insert_once(source: str, anchor: str, inserted: str, marker: str, where: str) -> str:
    """Insert text after a unique stable anchor, unless already patched."""
    if marker in source:
        return source
    count = source.count(anchor)
    if count != 1:
        raise PatchMismatch(f"{where}: expected one anchor, found {count}: {anchor[:78]!r}")
    return source.replace(anchor, anchor + inserted, 1)


def swap_once(source: str, before: str, after: str, where: str) -> str:
    if after in source:
        return source
    count = source.count(before)
    if count != 1:
        raise PatchMismatch(f"{where}: expected one anchor, found {count}: {before[:78]!r}")
    return source.replace(before, after, 1)


def patch(path: str, source: str) -> str:
    if path == "data/catalog.ts":
        # Undo the earlier overlay's separate destination card. The user asked
        # for a targeted-search button, while keeping the original Jasper card.
        old = (
            '  {\n    name: "Buffalo National River",\n'
            '    detail: "Ozark river country, bluffs and stays near the park",\n'
            '    searchTerms: ["Buffalo National River", "Buffalo River", "Jasper", "Ponca", "Compton", "St. Joe", "Marshall", "Gilbert", "Yellville"],\n'
            '  },\n'
        )
        if old in source:
            source = source.replace(old, "", 1)
        if '    name: "Jasper",' not in source:
            raise PatchMismatch("data/catalog.ts: the original Jasper destination is missing")
        return source

    if path == "app/page.tsx":
        if 'const stayCollections = [\n' not in source:
            raise PatchMismatch("app/page.tsx: browse-by-type collections not found")
        cards = [
            ('Buffalo National River', "Cabins, cottages and stays along the Buffalo River country.", 'Buffalo National River'),
            ('Unique stays', "Glamping, tiny homes and stays that are a little different.", 'Unique stays'),
            ('Group getaways', "Cabins and homes with room for eight or more.", 'Sleeps 8+'),
        ]
        additions = []
        for label,detail,filter_key in cards:
            if f'label: "{label}"' not in source:
                additions.append(
                    '  {\n'
                    f'    label: "{label}",\n'
                    f'    detail: "{detail}",\n'
                    f'    filter: "{filter_key}",\n'
                    '  },\n'
                )
        if additions:
            source = source.replace('const stayCollections = [\n', 'const stayCollections = [\n' + ''.join(additions), 1)
        # Remove only the old temporary destination-image entry (if present).
        source = source.replace('  "Buffalo National River": "/stay-types/slice-waterfront.png",\n', '')
        # Keep the existing 6-destination layout unchanged, including Jasper.
        source = source.replace('{destinations.filter((destination) => destination.name !== "Jasper").map((destination) => (', '{destinations.map((destination) => (')
        source = source.replace('{destinations.filter((destination) => destination.name !== "Jasper").map((destination) => {', '{destinations.map((destination) => {')
        if any(f'label: "{label}"' not in source for label,_,_ in cards):
            raise PatchMismatch("app/page.tsx: target buttons not found after edit")
        return source

    if path == "app/stays/page.tsx":
        for label,title in (
            ('Buffalo National River','Stays near the Buffalo National River'),
            ('Unique stays','One-of-a-kind stays'),
            ('Sleeps 8+','Group getaways for eight or more'),
        ):
            source = insert_once(source, '  Cabin: "Cabins",\n',
                f'  "{label}": "{title}",\n', f'  "{label}":', path)
        source = insert_once(source,
            '  const collectionHeading = initialFilter ? collectionHeadings[initialFilter] : "";\n',
            '  const buffaloRiverSearch = /^(buffalo( national)? river( country| area)?)$/i.test(where.trim());\n',
            '  const buffaloRiverSearch = ',path)
        source = swap_once(source,
            '                {search.usedNearby\n                  ? ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`\n                  : null}',
            '                {search.usedNearby\n                  ? buffaloRiverSearch\n                    ? ` Search covers stays roughly ${radius} miles from several access areas along the Buffalo National River; distances are approximate.`\n                    : ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`\n                  : null}',path)
        source = insert_once(source,
            '          properties={properties}\n',
            '          radiusMiles={radius}\n',
            '          radiusMiles={radius}',path)
        return source

    if path == "components/StayResults.tsx":
        source = insert_once(source,
            'import { PropertyCard } from "./PropertyCard";\n',
            'import { isLargeGroupStay, isUniqueStay } from "@/lib/public/discovery-categories";\n'
            'import { searchBuffaloRiverStays } from "@/lib/public/buffalo-river-discovery";\n',
            'import { searchBuffaloRiverStays }',path)
        for label in ('Sleeps 8+', 'Unique stays', 'Buffalo National River'):
            source = insert_once(source,
                'const filterOptions = [\n', f'  "{label}",\n', f'  "{label}",',path)
        source = insert_once(source,
            '  availabilityConfirmed = false,\n',
            '  radiusMiles = 40,\n',
            '  radiusMiles = 40,',path)
        source = insert_once(source,
            '  availabilityConfirmed?: boolean;\n',
            '  radiusMiles?: number;\n',
            '  radiusMiles?: number;',path)
        source = insert_once(source,
            '  const filtered = useMemo(() => {\n',
            '    const buffaloSlugs = filters.includes("Buffalo National River")\n'
            '      ? new Set(searchBuffaloRiverStays(properties, "Buffalo National River", radiusMiles).map((property) => property.slug))\n'
            '      : null;\n',
            '    const buffaloSlugs = ',path)
        for code,marker in (
            ('        if (filter === "Unique stays") return isUniqueStay(property);\n','if (filter === "Unique stays")'),
            ('        if (filter === "Sleeps 8+") return isLargeGroupStay(property);\n','if (filter === "Sleeps 8+")'),
            ('        if (filter === "Buffalo National River") return buffaloSlugs?.has(property.slug) ?? false;\n','if (filter === "Buffalo National River")'),
        ):
            source = insert_once(source,
                '        if (filter === "Cabin") return property.type === "Cabin";\n',code,marker,path)
        source = swap_once(source,
            '  }, [destination, filters, guests, properties, sort]);',
            '  }, [destination, filters, guests, properties, radiusMiles, sort]);',path)
        return source

    if path == "lib/public/nearby-destination-search.ts":
        source = insert_once(source,
            'import { propertyMatchesDestination, type Property } from "@/data/catalog";\n',
            'import { isBuffaloRiverSearch, searchBuffaloRiverStays } from "@/lib/public/buffalo-river-discovery";\n',
            'import { isBuffaloRiverSearch, searchBuffaloRiverStays }',path)
        source = insert_once(source,
            '  if (!destination.trim()) return { properties, usedNearby: false };\n',
            '\n  if (isBuffaloRiverSearch(destination)) {\n'
            '    return { properties: searchBuffaloRiverStays(properties, destination, radiusMiles), usedNearby: true };\n'
            '  }\n',
            '  if (isBuffaloRiverSearch(destination)) {',path)
        return source

    if path == "components/Header.tsx":
        source = insert_once(source, 'import { Brand } from "./Brand";\n',
            'import { HostResourcesMenu } from "./HostResourcesMenu";\n',
            'import { HostResourcesMenu }',path)
        source = insert_once(source,
            '                  Host sign in\n                </Link>\n',
            '                <Link href="/property-managers" onClick={closeMenu}>\n'
            '                  Property managers\n'
            '                </Link>\n',
            '<Link href="/property-managers" onClick={closeMenu}>',path)
        source = swap_once(source,
            '            {primaryLinks.map(([label, href]) =>\n              href === "/social" ? (',
            '            {primaryLinks.map(([label, href]) =>\n              href === "/hosts" ? (\n'
            '                <HostResourcesMenu key={label} />\n'
            '              ) : href === "/social" ? (',path)
        return source

    if path == "components/Footer.tsx":
        source = insert_once(source,
            '            <Link href="/hosts">How hosting works</Link>\n',
            '            <Link href="/property-managers">For property managers</Link>\n',
            '<Link href="/property-managers">For property managers</Link>',path)
        return source

    raise PatchMismatch(f"Unexpected file {path}")


def apply(root: Path, check_only: bool) -> int:
    pending: dict[Path,str] = {}
    errors: list[str] = []
    for rel in SOURCE_FILES:
        path = root / rel
        if not path.is_file():
            errors.append(f"Missing source file: {rel}")
            continue
        try:
            before = path.read_text(encoding="utf-8")
            after = patch(rel,before)
            if after != before:
                pending[path] = after
        except Exception as exc:
            errors.append(f"{rel}: {exc}")
    for rel in REQUIRED:
        if not (root / rel).is_file():
            errors.append(f"Missing overlay file: {rel} (extract ZIP preserving folders)")
    if errors:
        print("ERROR: no files changed because preflight failed:",file=sys.stderr)
        print("\n".join(" - "+e for e in errors),file=sys.stderr)
        return 1
    print(f"Preflight passed: {len(SOURCE_FILES)} source files checked; {len(pending)} need changes")
    if not check_only:
        for path,value in pending.items():
            path.write_text(value,encoding="utf-8")
            print("Updated",path.relative_to(root))
    return 0


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root",nargs="?",default=".",type=Path)
    parser.add_argument("--check",action="store_true")
    a=parser.parse_args()
    sys.exit(apply(a.root.resolve(),a.check))
