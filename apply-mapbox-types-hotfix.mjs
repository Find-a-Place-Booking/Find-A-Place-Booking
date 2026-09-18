import { readFile, writeFile } from "node:fs/promises";

const path = "components/StayMap.tsx";
let source = await readFile(path, "utf8");

source = source.replace(
  'import type { MapboxGeoJSONFeature, MapLayerMouseEvent } from "mapbox-gl";',
  'import type { MapLayerMouseEvent } from "mapbox-gl";',
);

const helperAnchor = `function usableCoordinate(value: number, min: number, max: number) {\n  return Number.isFinite(value) && value >= min && value <= max;\n}\n`;
const helperReplacement = `function usableCoordinate(value: number, min: number, max: number) {\n  return Number.isFinite(value) && value >= min && value <= max;\n}\n\ntype MapPointFeature = {\n  geometry?: {\n    type?: string;\n    coordinates?: unknown;\n  };\n  properties?: Record<string, unknown> | null;\n};\n\nfunction pointCoordinates(\n  feature: MapPointFeature | undefined,\n): [number, number] | null {\n  if (feature?.geometry?.type !== "Point") return null;\n\n  const coordinates = feature.geometry.coordinates;\n  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;\n\n  const lng = Number(coordinates[0]);\n  const lat = Number(coordinates[1]);\n  if (\n    !usableCoordinate(lat, -90, 90) ||\n    !usableCoordinate(lng, -180, 180)\n  ) {\n    return null;\n  }\n\n  return [lng, lat];\n}\n`;
if (!source.includes("type MapPointFeature =")) {
  if (!source.includes(helperAnchor)) throw new Error("StayMap helper anchor not found.");
  source = source.replace(helperAnchor, helperReplacement);
}

const oldBlock = `      const openStay = (event: MapLayerMouseEvent) => {\n        const feature = event.features?.[0] as MapboxGeoJSONFeature | undefined;\n        const slug = String(feature?.properties?.slug || "");\n        const stay = stayBySlug.get(slug);\n        if (!stay || feature?.geometry.type !== "Point") return;\n\n        const coordinates = [...feature.geometry.coordinates] as [number, number];\n        popup.setLngLat(coordinates).setDOMContent(popupNode(stay)).addTo(map);\n      };\n\n      const expandCluster = (event: MapLayerMouseEvent) => {\n        const feature = event.features?.[0] as MapboxGeoJSONFeature | undefined;\n        if (!feature || feature.geometry.type !== "Point") return;\n        const coordinates = feature.geometry.coordinates as [number, number];\n        map.easeTo({\n          center: coordinates,\n          zoom: Math.min(map.getZoom() + 2, 12),\n        });\n      };\n`;
const newBlock = `      const openStay = (event: MapLayerMouseEvent) => {\n        const feature = event.features?.[0] as unknown as\n          | MapPointFeature\n          | undefined;\n        const slug = String(feature?.properties?.slug ?? "");\n        const stay = stayBySlug.get(slug);\n        const coordinates = pointCoordinates(feature);\n        if (!stay || !coordinates) return;\n\n        popup.setLngLat(coordinates).setDOMContent(popupNode(stay)).addTo(map);\n      };\n\n      const expandCluster = (event: MapLayerMouseEvent) => {\n        const feature = event.features?.[0] as unknown as\n          | MapPointFeature\n          | undefined;\n        const coordinates = pointCoordinates(feature);\n        if (!coordinates) return;\n\n        map.easeTo({\n          center: coordinates,\n          zoom: Math.min(map.getZoom() + 2, 12),\n        });\n      };\n`;
if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes("const coordinates = pointCoordinates(feature);")) {
  throw new Error("StayMap event-handler anchor not found.");
}

await writeFile(path, source);
console.log("Mapbox TypeScript hotfix applied to components/StayMap.tsx");
