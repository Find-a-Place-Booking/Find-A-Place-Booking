import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cssPath = path.join(root, "app", "globals.css");

if (!fs.existsSync(cssPath)) {
  throw new Error("app/globals.css was not found. Run this from the Find A Place repo root.");
}

let css = fs.readFileSync(cssPath, "utf8");

if (!css.includes("/* Mapbox marketplace maps */")) {
  throw new Error("The Mapbox milestone does not appear to be applied yet.");
}

const marker = "/* Compact Mapbox layout — Find A Place */";
if (css.includes(marker)) {
  console.log("Compact map layout is already applied.");
  process.exit(0);
}

css += `\n\n${marker}\n/* Keep maps useful without letting them dominate the stay cards/page. */\n@media(min-width:1001px){\n  .results-layout{grid-template-columns:minmax(0,1.5fr) minmax(320px,.68fr);gap:24px}\n  .map-shell.live-map{height:480px}\n}\n.home-map-section{padding:72px 0}\n.home-map-frame{height:410px}\n.home-map-frame .stay-map,.home-map-frame .stay-map-fallback{min-height:410px}\n@media(max-width:1000px){\n  .home-map-frame{height:390px}\n  .home-map-frame .stay-map,.home-map-frame .stay-map-fallback{min-height:390px}\n}\n@media(max-width:700px){\n  .home-map-section{padding:58px 0}\n  .home-map-frame{height:360px}\n  .home-map-frame .stay-map,.home-map-frame .stay-map-fallback{min-height:360px}\n  .map-shell.live-map{height:390px}\n}\n`;

fs.writeFileSync(cssPath, css);
console.log("Compact map layout applied.");
console.log("/stays desktop map: 480px tall and narrower.");
console.log("Homepage map: 410px desktop / 390px tablet / 360px mobile.");
