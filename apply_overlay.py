#!/usr/bin/env python3
"""Conservative, idempotent patch for Find A Place's existing UI source.

Run from repository root after copying the ZIP over the project. The script
preflights every exact anchor before writing any file. --check makes no edits.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys


def replacement_plans() -> dict[str, list[tuple[str, str]]]:
    return {
        "data/catalog.ts": [(
            '  {\n    name: "Jasper",',
            '  {\n    name: "Buffalo National River",\n'
            '    detail: "Ozark river country, bluffs and stays near the park",\n'
            '    searchTerms: ["Buffalo National River", "Buffalo River", "Jasper", "Ponca", "Compton", "St. Joe", "Marshall", "Gilbert", "Yellville"],\n'
            '  },\n  {\n    name: "Jasper",'
        )],
        "app/page.tsx": [(
            'const stayCollections = [\n  {\n    label: "Cabins",',
            'const stayCollections = [\n'
            '  {\n    label: "Unique stays",\n    detail: "Something a little different, from glamping to tiny homes.",\n    filter: "Unique stays",\n  },\n'
            '  {\n    label: "Group getaways",\n    detail: "Cabins and homes with space for eight or more.",\n    filter: "Sleeps 8+",\n  },\n'
            '  {\n    label: "Cabins",'
        ),(
            'const destinationImages: Record<string, string> = {\n',
            'const destinationImages: Record<string, string> = {\n'
            '  "Buffalo National River": "/stay-types/slice-waterfront.png",\n'
        ),(
            '{destinations.map((destination) => (',
            '{destinations.filter((destination) => destination.name !== "Jasper").map((destination) => ('
        ),(
            '{destinations.map((destination) => {',
            '{destinations.filter((destination) => destination.name !== "Jasper").map((destination) => {'
        )],
        "app/stays/page.tsx": [(
            '  Cabin: "Cabins",',
            '  "Unique stays": "One-of-a-kind stays",\n'
            '  "Sleeps 8+": "Group getaways for eight or more",\n'
            '  Cabin: "Cabins",'
        ),(
            '  const collectionHeading = initialFilter ? collectionHeadings[initialFilter] : "";\n',
            '  const collectionHeading = initialFilter ? collectionHeadings[initialFilter] : "";\n'
            '  const buffaloRiverSearch = /^(buffalo( national)? river( country| area)?)$/i.test(where.trim());\n'
        ),(
            '                {search.usedNearby\n                  ? ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`\n                  : null}',
            '                {search.usedNearby\n                  ? buffaloRiverSearch\n                    ? ` Search covers stays roughly ${radius} miles from several access areas along the Buffalo National River; distances are approximate.`\n                    : ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`\n                  : null}'
        )],
        "components/StayResults.tsx": [(
            'import { PropertyCard } from "./PropertyCard";',
            'import { PropertyCard } from "./PropertyCard";\n'
            'import { isLargeGroupStay, isUniqueStay } from "@/lib/public/discovery-categories";'
        ),(
            'const filterOptions = [\n  "Cabin",',
            'const filterOptions = [\n  "Unique stays",\n  "Sleeps 8+",\n  "Cabin",'
        ),(
            '        if (filter === "Cabin") return property.type === "Cabin";',
            '        if (filter === "Unique stays") return isUniqueStay(property);\n'
            '        if (filter === "Sleeps 8+") return isLargeGroupStay(property);\n'
            '        if (filter === "Cabin") return property.type === "Cabin";'
        )],
        "lib/public/nearby-destination-search.ts": [(
            'import { propertyMatchesDestination, type Property } from "@/data/catalog";',
            'import { propertyMatchesDestination, type Property } from "@/data/catalog";\n'
            'import { isBuffaloRiverSearch, searchBuffaloRiverStays } from "@/lib/public/buffalo-river-discovery";'
        ),(
            '  if (!destination.trim()) return { properties, usedNearby: false };\n\n  const center = await destinationCenter(destination, properties);',
            '  if (!destination.trim()) return { properties, usedNearby: false };\n\n'
            '  if (isBuffaloRiverSearch(destination)) {\n'
            '    return { properties: searchBuffaloRiverStays(properties, destination, radiusMiles), usedNearby: true };\n'
            '  }\n\n'
            '  const center = await destinationCenter(destination, properties);'
        )],
        "components/Header.tsx": [(
            'import { Brand } from "./Brand";',
            'import { Brand } from "./Brand";\nimport { HostResourcesMenu } from "./HostResourcesMenu";'
        ),(
            '                <Link\n                  href="/host/sign-in"\n                  prefetch={false}\n                  onClick={closeMenu}\n                >\n                  Host sign in\n                </Link>',
            '                <Link\n                  href="/host/sign-in"\n                  prefetch={false}\n                  onClick={closeMenu}\n                >\n                  Host sign in\n                </Link>\n'
            '                <Link href="/property-managers" onClick={closeMenu}>\n'
            '                  Property managers\n'
            '                </Link>'
        ),(
            '            {primaryLinks.map(([label, href]) =>\n              href === "/social" ? (',
            '            {primaryLinks.map(([label, href]) =>\n              href === "/hosts" ? (\n'
            '                <HostResourcesMenu key={label} />\n'
            '              ) : href === "/social" ? ('
        )],
        "components/Footer.tsx": [(
            '            <Link href="/hosts">How hosting works</Link>',
            '            <Link href="/hosts">How hosting works</Link>\n'
            '            <Link href="/property-managers">For property managers</Link>'
        )],
    }


def apply(root: Path, check_only: bool) -> int:
    plans = replacement_plans()
    pending: dict[Path, str] = {}
    errors: list[str] = []
    for relative, edits in plans.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"Missing file: {relative}")
            continue
        try:
            current = path.read_text(encoding="utf-8")
        except Exception as exc:
            errors.append(f"Cannot read {relative}: {exc}")
            continue
        updated = current
        for before, after in edits:
            # Check for the full replacement before checking the old anchor:
            # some replacements deliberately retain the original anchor.
            if after in updated:
                continue
            count = updated.count(before)
            if count == 1:
                updated = updated.replace(before, after, 1)
            else:
                errors.append(f"Unexpected source in {relative}: anchor count={count}, expected one; source may have changed")
        if updated != current:
            pending[path] = updated

    required = [
        "lib/public/discovery-categories.ts",
        "lib/public/buffalo-river-discovery.ts",
        "components/HostResourcesMenu.tsx",
        "components/HostResourcesMenu.module.css",
        "app/property-managers/page.tsx",
        "app/property-managers/property-managers.module.css",
    ]
    for relative in required:
        if not (root / relative).is_file():
            errors.append(f"Missing new overlay file {relative}; extract ZIP with its folders first")
    if errors:
        print("ERROR: No existing source files were changed:", file=sys.stderr)
        print("\n".join(f" - {message}" for message in errors), file=sys.stderr)
        return 1
    print(f"Preflight passed for {len(plans)} existing files.")
    print(f"{len(pending)} files {'would change' if check_only else 'to update'}.")
    if not check_only:
        for path, updated in pending.items():
            path.write_text(updated, encoding="utf-8")
            print("Updated", path.relative_to(root))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=".", type=Path)
    parser.add_argument("--check", action="store_true", help="Validate anchors, don't modify files")
    args = parser.parse_args()
    sys.exit(apply(args.root.resolve(), args.check))
