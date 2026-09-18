import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function replaceOnce(content, before, after, label) {
  const first = content.indexOf(before);
  if (first === -1) throw new Error(`Could not find patch anchor: ${label}`);
  if (content.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return content.slice(0, first) + after + content.slice(first + before.length);
}

const files = {
  listings: 'lib/public/listings.ts',
  stays: 'app/stays/page.tsx',
  results: 'components/StayResults.tsx',
};

let listings = read(files.listings);
let stays = read(files.stays);
let results = read(files.results);

// 1) Add optional marketplace search constraints to the published listing loader.
listings = replaceOnce(
  listings,
  `type PublicDetailRow = {`,
  `export type PublishedPropertySearch = {\n  checkIn?: string;\n  checkOut?: string;\n  guests?: number;\n};\n\ntype PublicDetailRow = {`,
  'PublishedPropertySearch type',
);

listings = replaceOnce(
  listings,
  `export async function getPublishedProperties(\n  limit?: number,\n): Promise<Property[]> {\n  const supabase = await createClient();\n  const { data, error } = await supabase.rpc("public_listing_index");`,
  `function validSearchDate(value?: string) {\n  if (!value || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null;\n\n  const parsed = new Date(\`\${value}T00:00:00Z\`);\n  if (Number.isNaN(parsed.getTime())) return null;\n  if (parsed.toISOString().slice(0, 10) !== value) return null;\n\n  return value;\n}\n\nfunction validSearchRange(search?: PublishedPropertySearch) {\n  const checkIn = validSearchDate(search?.checkIn);\n  const checkOut = validSearchDate(search?.checkOut);\n\n  if (!checkIn || !checkOut || checkOut <= checkIn) return null;\n\n  return {\n    checkIn,\n    checkOut,\n    guests:\n      Number.isInteger(search?.guests) && Number(search?.guests) > 0\n        ? Number(search?.guests)\n        : null,\n  };\n}\n\nfunction stayNights(checkIn: string, checkOut: string) {\n  const start = new Date(\`\${checkIn}T00:00:00Z\`).getTime();\n  const end = new Date(\`\${checkOut}T00:00:00Z\`).getTime();\n  return Math.round((end - start) / 86_400_000);\n}\n\nexport async function getPublishedProperties(\n  limit?: number,\n  search?: PublishedPropertySearch,\n): Promise<Property[]> {\n  const supabase = await createClient();\n  const { data, error } = await supabase.rpc("public_listing_index");`,
  'getPublishedProperties search signature and helpers',
);

listings = replaceOnce(
  listings,
  `  const allRows = (data ?? []) as PublicIndexRow[];\n  const rows =\n    typeof limit === "number" && limit >= 0\n      ? allRows.slice(0, limit)\n      : allRows;\n\n  const coverPaths = rows.map((row) => row.image_paths?.[0] ?? null);`,
  `  let rows = (data ?? []) as PublicIndexRow[];\n  const searchRange = validSearchRange(search);\n\n  if (searchRange) {\n    const admin = createAdminClient();\n    const [blocksResult, unitRulesResult] = await Promise.all([\n      admin\n        .from("availability_blocks")\n        .select("unit_id,block_type,expires_at")\n        .eq("state", "ACTIVE")\n        .lt("start_date", searchRange.checkOut)\n        .gt("end_date", searchRange.checkIn),\n      admin\n        .from("property_units")\n        .select("id,minimum_stay_nights,max_guests")\n        .eq("is_active", true),\n    ]);\n\n    if (blocksResult.error || unitRulesResult.error) {\n      console.error("[getPublishedProperties] availability search failed", {\n        blocks: blocksResult.error,\n        units: unitRulesResult.error,\n      });\n      throw new Error("Unable to check stay availability right now.");\n    }\n\n    const now = Date.now();\n    const blockedUnitIds = new Set(\n      (blocksResult.data ?? [])\n        .filter((block) => {\n          if (block.block_type !== "INTERNAL_HOLD") return true;\n          if (!block.expires_at) return true;\n\n          const expiresAt = new Date(block.expires_at).getTime();\n          return Number.isNaN(expiresAt) || expiresAt > now;\n        })\n        .map((block) => block.unit_id),\n    );\n\n    const rulesByUnit = new Map(\n      (unitRulesResult.data ?? []).map((unit) => [unit.id, unit]),\n    );\n    const nights = stayNights(searchRange.checkIn, searchRange.checkOut);\n\n    rows = rows.filter((row) => {\n      if (blockedUnitIds.has(row.unit_id)) return false;\n\n      const rules = rulesByUnit.get(row.unit_id);\n      if (!rules) return false;\n\n      const minimumStay = Number(rules.minimum_stay_nights ?? 1);\n      if (nights < minimumStay) return false;\n\n      const maxGuests = rules.max_guests ?? row.max_guests;\n      if (\n        searchRange.guests !== null &&\n        maxGuests !== null &&\n        searchRange.guests > Number(maxGuests)\n      ) {\n        return false;\n      }\n\n      return true;\n    });\n  }\n\n  if (typeof limit === "number" && limit >= 0) {\n    rows = rows.slice(0, limit);\n  }\n\n  const coverPaths = rows.map((row) => row.image_paths?.[0] ?? null);`,
  'bulk availability filtering',
);

// 2) Make /stays run the availability filter when a valid date range is supplied.
stays = replaceOnce(
  stays,
  `function prettyDate(value?: string) {\n  if (!value) return null;\n  const date = new Date(\`\${value}T12:00:00\`);\n  if (Number.isNaN(date.getTime())) return null;\n  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });\n}`,
  `function prettyDate(value?: string) {\n  if (!value) return null;\n  const date = new Date(\`\${value}T12:00:00\`);\n  if (Number.isNaN(date.getTime())) return null;\n  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });\n}\n\nfunction validDateRange(checkIn: string, checkOut: string) {\n  if (\n    !/^\\d{4}-\\d{2}-\\d{2}$/.test(checkIn) ||\n    !/^\\d{4}-\\d{2}-\\d{2}$/.test(checkOut)\n  ) {\n    return false;\n  }\n\n  const start = new Date(\`\${checkIn}T00:00:00Z\`);\n  const end = new Date(\`\${checkOut}T00:00:00Z\`);\n\n  return (\n    !Number.isNaN(start.getTime()) &&\n    !Number.isNaN(end.getTime()) &&\n    start.toISOString().slice(0, 10) === checkIn &&\n    end.toISOString().slice(0, 10) === checkOut &&\n    end > start\n  );\n}`,
  'validDateRange helper',
);

stays = replaceOnce(
  stays,
  `export default async function StaysPage({ searchParams }: { searchParams: Promise<{ where?: string; checkin?: string; checkout?: string; guests?: string; filter?: string }> }) {\n  const [params, properties] = await Promise.all([searchParams, getPublishedProperties()]);\n  const where = params.where || "";\n  const checkin = params.checkin || "";\n  const checkout = params.checkout || "";\n  const guests = params.guests || "2";\n  const initialFilter = params.filter && collectionHeadings[params.filter] ? params.filter : "";\n  const start = prettyDate(checkin);\n  const end = prettyDate(checkout);`,
  `export default async function StaysPage({ searchParams }: { searchParams: Promise<{ where?: string; checkin?: string; checkout?: string; guests?: string; filter?: string }> }) {\n  const params = await searchParams;\n  const where = params.where || "";\n  const checkin = params.checkin || "";\n  const checkout = params.checkout || "";\n  const guests = params.guests || "2";\n  const guestCount = Number.parseInt(guests, 10) || 2;\n  const dateSearchActive = validDateRange(checkin, checkout);\n  const properties = await getPublishedProperties(undefined, {\n    checkIn: checkin,\n    checkOut: checkout,\n    guests: guestCount,\n  });\n  const initialFilter = params.filter && collectionHeadings[params.filter] ? params.filter : "";\n  const start = prettyDate(checkin);\n  const end = prettyDate(checkout);`,
  'stays page data load',
);

stays = replaceOnce(
  stays,
  `            <div className="availability-fresh"><i/> Date matching coming soon</div>`,
  `            <div className="availability-fresh"><i/> {dateSearchActive ? "Availability checked" : "Add dates to check availability"}</div>`,
  'availability status copy',
);

stays = replaceOnce(
  stays,
  `        <StayResults properties={properties} destination={where} guests={Number.parseInt(guests, 10) || 2} initialFilter={initialFilter} />`,
  `        <StayResults properties={properties} destination={where} guests={guestCount} initialFilter={initialFilter} dateSearchActive={dateSearchActive} />`,
  'StayResults props',
);

// 3) Update results messaging so filtered availability is clear to guests.
results = replaceOnce(
  results,
  `export function StayResults({ properties, destination, guests, initialFilter = "" }: { properties: Property[]; destination: string; guests: number; initialFilter?: string }) {`,
  `export function StayResults({\n  properties,\n  destination,\n  guests,\n  initialFilter = "",\n  dateSearchActive = false,\n}: {\n  properties: Property[];\n  destination: string;\n  guests: number;\n  initialFilter?: string;\n  dateSearchActive?: boolean;\n}) {`,
  'StayResults signature',
);

results = replaceOnce(
  results,
  `          <div className="results-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? "stay" : "stays"} <span>· Dates above don’t narrow results yet</span></div>\n          {filtered.length > 0 ? <div className="result-grid">{filtered.map((property) => <PropertyCard key={property.slug} property={property} />)}</div> :\n            <div className="empty-results production-empty"><p className="eyebrow dark">{inventoryEmpty ? "More places are coming" : "Nothing matched"}</p><h2>{inventoryEmpty ? "We’re still getting the first places ready." : "No stays match those filters."}</h2><p>{inventoryEmpty ? "New stays will show up here as hosts finish getting them ready." : "Try removing a filter or searching a nearby destination."}</p>{!inventoryEmpty && <button type="button" className="button button-quiet" onClick={() => setFilters([])}>Clear filters</button>}</div>}`,
  `          <div className="results-count">\n            <strong>{filtered.length}</strong> {filtered.length === 1 ? "stay" : "stays"}\n            {dateSearchActive ? <span> · Available for your dates</span> : null}\n          </div>\n          {filtered.length > 0 ? <div className="result-grid">{filtered.map((property) => <PropertyCard key={property.slug} property={property} />)}</div> :\n            <div className="empty-results production-empty">\n              <p className="eyebrow dark">{dateSearchActive ? "No availability" : inventoryEmpty ? "More places are coming" : "Nothing matched"}</p>\n              <h2>{dateSearchActive ? "No stays are available for those dates." : inventoryEmpty ? "We’re still getting the first places ready." : "No stays match those filters."}</h2>\n              <p>{dateSearchActive ? "Try a different date range, a nearby destination or fewer guests." : inventoryEmpty ? "New stays will show up here as hosts finish getting them ready." : "Try removing a filter or searching a nearby destination."}</p>\n              {!inventoryEmpty && filters.length > 0 ? <button type="button" className="button button-quiet" onClick={() => setFilters([])}>Clear filters</button> : null}\n            </div>}`,
  'results availability copy',
);

// Only write after every anchor has validated and every transformation succeeded.
fs.writeFileSync(path.join(root, files.listings), listings, 'utf8');
fs.writeFileSync(path.join(root, files.stays), stays, 'utf8');
fs.writeFileSync(path.join(root, files.results), results, 'utf8');

console.log('Date-aware marketplace search applied successfully:');
console.log(`  - ${files.listings}`);
console.log(`  - ${files.stays}`);
console.log(`  - ${files.results}`);
console.log('');
console.log('Next: npm run typecheck && npm run build');
