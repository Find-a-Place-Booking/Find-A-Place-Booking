#!/usr/bin/env python3
"""Guarded, repeat-safe home partner map + nearby destination search overlay.
Usage: python path/to/apply_overlay.py /path/to/Find-A-Place-Booking
"""
from pathlib import Path
import argparse
import sys

ROOT = Path(__file__).resolve().parent


def exact_replace(contents: str, old: str, new: str, path: str) -> str:
    if new in contents:
        return contents
    count = contents.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one target anchor, found {count}: {old[:125]!r}")
    return contents.replace(old, new, 1)


def patch_files(root: Path) -> list[str]:
    replacements: dict[str, str] = {}

    def file(path: str) -> str:
        source = root / path
        if not source.is_file():
            raise RuntimeError(f"Missing repo source file: {source}")
        return replacements.get(path, source.read_text(encoding="utf-8"))

    def change(path: str, old: str, new: str) -> None:
        replacements[path] = exact_replace(file(path), old, new, path)

    about = "app/about/page.tsx"
    change(about,
           'import { DeferredBackgroundVideo } from "@/components/DeferredBackgroundVideo";',
           'import { DeferredBackgroundVideo } from "@/components/DeferredBackgroundVideo";\nimport { FindAPlacePartnerMap } from "@/components/FindAPlacePartnerMap";')

    # Extract the About-page partner map and replace with the *same* shared
    # component used on the homepage. Both keep their own copy headings.
    about_content = file(about)
    start_anchor = '        <section className={styles.partnerMapSection}>'
    next_anchor = '        <section className="host-cta">'
    if start_anchor in about_content:
        if about_content.count(start_anchor) != 1 or about_content.count(next_anchor) != 1:
            raise RuntimeError("About page map anchors have unexpectedly changed.")
        start = about_content.index(start_anchor)
        stop = about_content.index(next_anchor, start)
        old_map_section = about_content[start:stop]
        if '1znr--DZK2UInog1toBsweyTKqHtFPnU' not in old_map_section:
            raise RuntimeError("About page partner map ID does not match inspected source.")
        new_map_section = '''        <FindAPlacePartnerMap
          eyebrow={mapIntro.eyebrow}
          title={mapIntro.title}
          description={mapIntro.body}
        />

'''
        change(about, old_map_section, new_map_section)
    elif '<FindAPlacePartnerMap\n          eyebrow={mapIntro.eyebrow}' not in about_content:
        raise RuntimeError("About page original partner-map section is missing.")

    home = "app/page.tsx"
    change(home,
           'import { DeferredStayMap } from "@/components/DeferredStayMap";',
           'import { DeferredStayMap } from "@/components/DeferredStayMap";\nimport { FindAPlacePartnerMap } from "@/components/FindAPlacePartnerMap";')
    change(home,
           '        </section>\n      </main>\n\n      <Footer />',
           '''        </section>

        <FindAPlacePartnerMap
          eyebrow="Across the Find A Place network"
          title="Explore the original Find A Place partner map."
          description="Discover stays, local partners and outdoor places across the Find A Place network. Explore the map, or open it full screen to plan your trip."
        />
      </main>

      <Footer />''')

    bar = "components/SearchBar.tsx"
    change(bar, '  guests = "2",\n', '  guests = "2",\n  radius = "40",\n')
    change(bar, '  guests?: string;\n', '  guests?: string;\n  radius?: string;\n')
    change(bar, '            guests: String(data.get("guests") || "2"),\n',
           '            guests: String(data.get("guests") || "2"),\n            radius_miles: String(data.get("radius") || "40"),\n')
    change(bar, '        <label>\n          <span>Check in</span>', '''        <label className="search-radius-field">
          <span>Nearby area</span>
          <select name="radius" defaultValue={radius} aria-label="Search within miles">
            <option value="15">15 miles</option>
            <option value="25">25 miles</option>
            <option value="40">40 miles</option>
            <option value="60">60 miles</option>
            <option value="100">100 miles</option>
          </select>
        </label>
        <label>
          <span>Check in</span>''')

    stays = "app/stays/page.tsx"
    change(stays,
           'import { propertyMatchesDestination } from "@/data/catalog";',
           'import { normalizeSearchRadiusMiles, searchPublishedStaysNearby } from "@/lib/public/nearby-destination-search";')
    change(stays, '    guests?: string;\n    filter?: string;',
           '    guests?: string;\n    radius?: string;\n    filter?: string;')
    change(stays,
           '  const guestCount = Number.parseInt(guests, 10) || 2;',
           '  const guestCount = Number.parseInt(guests, 10) || 2;\n  const radius = normalizeSearchRadiusMiles(params.radius);')
    change(stays, '''  const properties = allProperties.filter(
    (property) =>
      propertyMatchesDestination(property, where) &&
      property.sleeps >= guestCount,
  );''', '''  const search = await searchPublishedStaysNearby(allProperties, where, radius);
  const properties = search.properties.filter((property) => property.sleeps >= guestCount);''')
    change(stays,
           '                guests={guests}\n              />',
           '                guests={guests}\n                radius={String(radius)}\n              />')
    change(stays,
           '              <p>{summary.body}</p>',
           '''              <p>
                {summary.body}
                {search.usedNearby
                  ? ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`
                  : null}
              </p>''')

    # A map popup was using temporary signed gallery images on the results
    # page. Prefer the existing stable public stay-cover proxy so long-lived
    # map sessions do not show expired images or an unnecessary brand fallback.
    stay_map = "components/StayMap.tsx"
    change(stay_map, '''function stayImage(stay: StayMapItem) {
  return (
    stay.image ||
    `/api/public/stay-cover/${encodeURIComponent(stay.slug)}`
  );
}''', '''function stayImage(stay: StayMapItem) {
  return `/api/public/stay-cover/${encodeURIComponent(stay.slug)}`;
}''')

    layout = "app/layout.tsx"
    change(layout,
           'import "./guest-feedback-fixes.css";',
           'import "./guest-feedback-fixes.css";\nimport "./nearby-search-controls.css";')

    # Validate *every* guarded replacement before writing anything.
    # Existing new files from the overlay are copied only when absent or identical.
    added = [
        "components/FindAPlacePartnerMap.tsx",
        "lib/public/nearby-destination-search.ts",
        "app/nearby-search-controls.css",
    ]
    for name in added:
        destination = root / name
        source = ROOT / name
        expected = source.read_bytes()
        if destination.exists() and destination.read_bytes() != expected:
            raise RuntimeError(f"{name}: existing destination differs; refusing to overwrite.")

    changed: list[str] = []
    for name, content in replacements.items():
        dest = root / name
        if dest.read_text(encoding="utf-8") != content:
            dest.write_text(content, encoding="utf-8")
            changed.append(name)
    for name in added:
        dest = root / name
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes((ROOT / name).read_bytes())
            changed.append(name)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo_root", type=Path)
    args = parser.parse_args()
    try:
        changed = patch_files(args.repo_root.resolve())
    except Exception as exc:
        print(f"Overlay aborted: {exc}", file=sys.stderr)
        return 1
    if not changed:
        print("Already applied: no changes needed.")
    else:
        print("Overlay prepared:")
        for name in changed:
            print("  ", name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
