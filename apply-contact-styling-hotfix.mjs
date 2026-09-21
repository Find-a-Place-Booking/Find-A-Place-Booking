import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] || ".");
const overlayRoot = path.join(packageRoot, "overlay");
const marker = "/* === FIND A PLACE CONTACT/SOCIAL STYLING HOTFIX === */";

function fail(message) {
  console.error(`\n[Find A Place styling hotfix] ${message}`);
  process.exit(1);
}

function copy(rel) {
  const source = path.join(overlayRoot, rel);
  const dest = path.join(target, rel);
  if (!fs.existsSync(source)) fail(`Missing hotfix file: ${rel}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
  console.log(`updated  ${rel}`);
}

if (!fs.existsSync(path.join(target, "package.json")) || !fs.existsSync(path.join(target, "app", "host"))) {
  fail(`Target does not look like the Find A Place Booking project: ${target}`);
}

if (!fs.existsSync(path.join(target, "lib", "brand-links.ts"))) {
  fail("The contact/social feature pass does not appear to be installed yet. Apply that pass first, then this styling hotfix.");
}

copy("app/contact/page.tsx");
copy("app/contact/contact.module.css");

const themePath = path.join(target, "app", "find-a-place-theme.css");
if (!fs.existsSync(themePath)) fail("Missing app/find-a-place-theme.css");

let theme = fs.readFileSync(themePath, "utf8");
const hotfix = fs.readFileSync(path.join(packageRoot, "global-hotfix.css"), "utf8");

if (!theme.includes(marker)) {
  theme = `${theme.trimEnd()}\n\n${marker}\n${hotfix.trim()}\n`;
  fs.writeFileSync(themePath, theme, "utf8");
  console.log("updated  app/find-a-place-theme.css (shared styling appended)");
} else {
  console.log("skipped  app/find-a-place-theme.css (hotfix already present)");
}

console.log("\nStyling hotfix applied.");
console.log("Recommended checks:");
console.log("  npm run typecheck");
console.log("  npm run build");
console.log("\nThen refresh /contact, /help, the footer, /host/sign-up, /host/onboarding and /host.");
