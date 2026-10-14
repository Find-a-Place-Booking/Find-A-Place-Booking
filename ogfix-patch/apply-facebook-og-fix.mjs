import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Run from the Find A Place Booking repository root.
const root = process.cwd();
const base = dirname(fileURLToPath(import.meta.url));
const required = join(root, "app/stays/[slug]/page.tsx");
const robotsPath = join(root, "app/robots.ts");
if (!existsSync(required) || !existsSync(robotsPath)) {
  throw new Error("Run this script from the Find A Place Booking repo root.");
}

const page = readFileSync(required, "utf8");
const oldMeta = /  const socialImage = property\.images\[0\]\s*\? absoluteUrl\(\s*`\/api\/public\/stay-social-image\/\$\{encodeURIComponent\(\s*property\.slug,?\s*\)\}`,\s*\)\s*: absoluteUrl\("\/brand\/find-a-place-seal\.png"\);/;
const newMeta = '  const socialImage = absoluteUrl(`/stay-share/${encodeURIComponent(property.slug)}`);';
let updatedPage;
if (oldMeta.test(page)) {
  updatedPage = page.replace(oldMeta, newMeta);
} else if (page.includes(newMeta)) {
  updatedPage = page;
} else {
  throw new Error("The current stay page social metadata changed; stop rather than replace unrelated code.");
}
updatedPage = updatedPage.replace(
  'images: [{ url: socialImage, alt: property.name }],',
  'images: [{ url: socialImage, alt: property.name, width: 1200, height: 630 }],',
);

const robots = readFileSync(robotsPath, "utf8");
let updatedRobots;
if (robots.includes('allow: "/",')) {
  updatedRobots = robots.replace('allow: "/",', 'allow: ["/", "/api/public/stay-social-image/"],');
} else if (robots.includes('allow: ["/", "/api/public/stay-social-image/"],')) {
  updatedRobots = robots;
} else {
  throw new Error("Unexpected robots.ts: stop rather than overwrite crawler rules.");
}

for (const path of [
  "lib/public/serve-stay-social-image.ts",
  "app/stay-share/[slug]/route.ts",
  "app/api/public/stay-social-image/[slug]/route.ts",
  "app/stays/[slug]/opengraph-image.tsx",
]) {
  const src = join(base, "files", path);
  const dst = join(root, path);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
  console.log(`Written ${path}`);
}
writeFileSync(required, updatedPage);
writeFileSync(robotsPath, updatedRobots);
console.log("Updated app/stays/[slug]/page.tsx and app/robots.ts");
console.log("Run npm run build, then commit/push to main. Check Facebook debugger after deployment.");
