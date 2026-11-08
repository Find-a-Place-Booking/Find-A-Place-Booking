from pathlib import Path
from tempfile import TemporaryDirectory
import importlib.util

script=Path(__file__).parents[1]/'apply_overlay.py'
spec=importlib.util.spec_from_file_location('apply_overlay',script)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# Minimal current-source fragments covering all guarded anchors.
BASE={
 'data/catalog.ts':'  {\n    name: "Jasper",\n  },\n',
 'app/page.tsx':'const stayCollections = [\n  {\n    label: "Cabins",\n  },\nconst destinationImages: Record<string, string> = {\nclassName="stay-type-card"\n{destinations.map((destination) => (\n{destinations.map((destination) => {\n',
 'app/stays/page.tsx':'  Cabin: "Cabins",\n  const collectionHeading = initialFilter ? collectionHeadings[initialFilter] : "";\n                {search.usedNearby\n                  ? ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`\n                  : null}\n          properties={properties}\n',
 'components/StayResults.tsx':'import { PropertyCard } from "./PropertyCard";\nconst filterOptions = [\n  "Cabin",\n  availabilityConfirmed = false,\n  availabilityConfirmed?: boolean;\n  const filtered = useMemo(() => {\n        if (filter === "Cabin") return property.type === "Cabin";\n  }, [destination, filters, guests, properties, sort]);\n',
 'lib/public/nearby-destination-search.ts':'import { propertyMatchesDestination, type Property } from "@/data/catalog";\n  if (!destination.trim()) return { properties, usedNearby: false };\n',
 'components/Header.tsx':'import { Brand } from "./Brand";\n                  Host sign in\n                </Link>\n            {primaryLinks.map(([label, href]) =>\n              href === "/social" ? (\n',
 'components/Footer.tsx':'            <Link href="/hosts">How hosting works</Link>\n',
}

def fixture(root,contents):
 for rel,content in contents.items():
  path=root/rel;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding='utf-8')
 for rel in mod.REQUIRED:
  path=root/rel;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('test',encoding='utf-8')

with TemporaryDirectory() as d:
 root=Path(d);fixture(root,BASE)
 assert mod.apply(root,True)==0
 assert mod.apply(root,False)==0
 first={p:(root/p).read_text() for p in mod.SOURCE_FILES}
 assert mod.apply(root,False)==0
 assert first=={p:(root/p).read_text() for p in mod.SOURCE_FILES}
 home=first['app/page.tsx'];results=first['components/StayResults.tsx']
 for label in ('Buffalo National River','Unique stays','Group getaways'):
  assert f'label: "{label}"' in home
 assert 'destination.name !== "Jasper"' not in home
 assert 'radiusMiles' in results
 assert 'searchBuffaloRiverStays' in results
 assert 'if (filter === "Buffalo National River")' in results
 assert 'if (filter === "Unique stays")' in results
 assert 'if (filter === "Sleeps 8+")' in results
 # No partial writes if an anchor is missing.
 (root/'components/Header.tsx').write_text('changed unexpectedly')
 saved={p:(root/p).read_text() for p in mod.SOURCE_FILES}
 assert mod.apply(root,False)==1
 assert saved=={p:(root/p).read_text() for p in mod.SOURCE_FILES}

# Previously applied overlay: home cards, Buffalo destination swap, and old chips.
with TemporaryDirectory() as d:
 root=Path(d);old=dict(BASE)
 old['app/page.tsx']=old['app/page.tsx'].replace('const stayCollections = [\n',
  'const stayCollections = [\n  {\n    label: "Unique stays",\n    detail: "Something a little different, from glamping to tiny homes.",\n    filter: "Unique stays",\n  },\n  {\n    label: "Group getaways",\n    detail: "Cabins and homes with space for eight or more.",\n    filter: "Sleeps 8+",\n  },\n')
 old['app/page.tsx']=old['app/page.tsx'].replace('const destinationImages: Record<string, string> = {\n',
  'const destinationImages: Record<string, string> = {\n  "Buffalo National River": "/stay-types/slice-waterfront.png",\n').replace('destinations.map(', 'destinations.filter((destination) => destination.name !== "Jasper").map(')
 old['data/catalog.ts']=old['data/catalog.ts'].replace('  {\n    name: "Jasper",',
  '  {\n    name: "Buffalo National River",\n    detail: "Ozark river country, bluffs and stays near the park",\n    searchTerms: ["Buffalo National River", "Buffalo River", "Jasper", "Ponca", "Compton", "St. Joe", "Marshall", "Gilbert", "Yellville"],\n  },\n  {\n    name: "Jasper",')
 fixture(root,old)
 assert mod.apply(root,False)==0
 assert mod.apply(root,False)==0
 home=(root/'app/page.tsx').read_text()
 assert home.count('label: "Unique stays"')==1 and home.count('label: "Group getaways"')==1
 assert home.count('label: "Buffalo National River"')==1
 assert 'destination.name !== "Jasper"' not in home
 assert '"Buffalo National River": "/stay-types/' not in home
 assert 'name: "Buffalo National River"' not in (root/'data/catalog.ts').read_text()
print('PASS: installation, previous-overlay compatibility, idempotence, fail-safe preflight, all three targeted buttons')
