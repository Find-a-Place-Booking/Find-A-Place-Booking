import fs from "node:fs";
import path from "node:path";

const packageRoot = path.dirname(new URL(import.meta.url).pathname);
const target = path.resolve(process.argv[2] || ".");
const overlayRoot = path.join(packageRoot, "overlay");

function fail(message) {
  console.error(`\n[Find A Place pass] ${message}`);
  process.exit(1);
}

function read(rel) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) fail(`Missing expected file: ${rel}`);
  return fs.readFileSync(file, "utf8");
}

function write(rel, content) {
  const file = path.join(target, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  console.log(`updated  ${rel}`);
}

function copyOverlay(rel) {
  const source = path.join(overlayRoot, rel);
  if (!fs.existsSync(source)) fail(`Overlay file missing: ${rel}`);
  write(rel, fs.readFileSync(source, "utf8"));
}

function replaceOnce(rel, before, after, marker) {
  let content = read(rel);
  if (marker && content.includes(marker)) {
    console.log(`skipped  ${rel} (already contains ${marker})`);
    return;
  }
  const index = content.indexOf(before);
  if (index < 0) fail(`Could not find the expected insertion point in ${rel}. The local file may differ from the production base this patch was built against.`);
  content = content.slice(0, index) + after + content.slice(index + before.length);
  write(rel, content);
}

if (!fs.existsSync(path.join(target, "package.json")) || !fs.existsSync(path.join(target, "app", "host"))) {
  fail(`Target does not look like Find A Place Booking: ${target}`);
}

console.log(`Applying Find A Place contact/social/advertising pass to:\n${target}\n`);

// New/replacement files.
for (const rel of [
  "lib/brand-links.ts",
  "components/SocialIcon.tsx",
  "components/Footer.tsx",
  "app/help/page.tsx",
  "app/contact/page.tsx",
  "app/contact-social-pass.css",
]) copyOverlay(rel);

// Load the new CSS globally without disturbing existing theme files.
replaceOnce(
  "app/layout.tsx",
  'import "./find-a-place-theme.css";\nimport "./accessibility-fixes.css";',
  'import "./find-a-place-theme.css";\nimport "./contact-social-pass.css";\nimport "./accessibility-fixes.css";',
  'import "./contact-social-pass.css";',
);

// New-host signup: make the optional promotion path visible before onboarding.
replaceOnce(
  "app/host/sign-up/page.tsx",
  '      </form>\n    </AuthShell>',
  `      </form>\n\n      <div className="host-signup-promo">\n        <strong>Want more than a booking listing?</strong>\n        <p>After signup, you can also ask Find A Place about a customized social media and advertising plan for your property. Promotion is optional and separate from booking commission.</p>\n        <Link href="/contact#advertising">Ask about advertising →</Link>\n      </div>\n    </AuthShell>`,
  'className="host-signup-promo"',
);

// Onboarding review: offer customized promotion before the host finishes setup.
let wizard = read("components/HostOnboardingWizard.tsx");
if (!wizard.includes('import Link from "next/link";')) {
  const importAnchor = '"use client";\n\n';
  if (!wizard.includes(importAnchor)) fail("Could not add next/link import to HostOnboardingWizard.tsx");
  wizard = wizard.replace(importAnchor, '"use client";\n\nimport Link from "next/link";\n');
}
if (!wizard.includes('className="host-advertising-card"')) {
  const wizardAnchor = '        </>}\n\n        <div className="wizard-actions">';
  const advertisingCard = `          <div className="host-advertising-card">\n            <span className="host-advertising-kicker">Optional promotion</span>\n            <h3>Want a customized advertising plan?</h3>\n            <p>Find A Place can also help promote your property through the social media and travel-community side of the network. Tell us what you want to promote and the team can put together a plan around your property, location and goals.</p>\n            <div className="host-advertising-actions">\n              <Link className="button button-small" href="/contact#advertising">Ask about advertising</Link>\n              <a href="https://www.findaplacear.com" target="_blank" rel="noreferrer">See the Find A Place network ↗</a>\n            </div>\n            <small>This is completely optional and does not change the 5% verified-partner or 7% standard booking commission.</small>\n          </div>\n        </>}\n\n        <div className="wizard-actions">`;
  const idx = wizard.indexOf(wizardAnchor);
  if (idx < 0) fail("Could not find the onboarding Review-step insertion point in HostOnboardingWizard.tsx");
  wizard = wizard.slice(0, idx) + advertisingCard + wizard.slice(idx + wizardAnchor.length);
}
write("components/HostOnboardingWizard.tsx", wizard);

// Host dashboard: turn the unused discovery placeholder into a real promotion option.
replaceOnce(
  "app/host/page.tsx",
  '<section className="panel performance"><p className="eyebrow dark">Network reach</p><h2>Discovery data</h2><div className="panel-empty"><strong>Performance begins after launch.</strong><span>Search impressions, property views and booking sources will appear here after listings are published.</span></div></section>',
  '<section className="panel performance host-promotion-panel"><p className="eyebrow dark">Promotion &amp; reach</p><h2>Want help getting in front of more travelers?</h2><div className="panel-empty"><strong>Ask about a custom Find A Place advertising plan.</strong><span>Optional social media and travel-community promotion can be built around your property, location, season or campaign goals. This is separate from the booking platform commission.</span><div className="host-promotion-actions"><Link className="button button-small" href="/contact#advertising">Ask about advertising</Link><a href="https://www.findaplacear.com" target="_blank" rel="noreferrer">See the Find A Place network ↗</a></div></div></section>',
  'className="panel performance host-promotion-panel"',
);

// Public host marketing page: connect the booking product to the existing social/community network.
replaceOnce(
  "app/hosts/page.tsx",
  '        <section className="hosts-steps shell">',
  `        <section className="host-promotion-band shell">\n          <div><p className="eyebrow dark">Optional property promotion</p><h2>Want a custom advertising plan too?</h2><p>The booking marketplace and the Find A Place social/community side can work together. Hosts can ask for a customized promotion plan built around the property, location, season and audience they want to reach. Advertising is optional and separate from the booking commission.</p></div>\n          <div className="host-promotion-actions"><Link className="button" href="/contact#advertising">Ask about advertising</Link><a href="https://www.findaplacear.com" target="_blank" rel="noreferrer">Explore FindAPlaceAR.com ↗</a></div>\n        </section>\n        <section className="hosts-steps shell">`,
  'className="host-promotion-band shell"',
);

// About page: one restrained bridge back to the original Find A Place network.
replaceOnce(
  "app/about/page.tsx",
  '              <p>{community.body}</p>',
  `              <p>{community.body}</p>\n              <a className="network-site-link" href="https://www.findaplacear.com" target="_blank" rel="noreferrer">Explore Find A Place Arkansas &amp; Beyond ↗</a>`,
  'className="network-site-link"',
);

console.log("\nDone. Recommended checks:");
console.log("  npm run typecheck");
console.log("  npm run build");
console.log("\nReview these routes after applying:");
console.log("  /host/sign-up");
console.log("  /host/onboarding (Review step)");
console.log("  /host");
console.log("  /help");
console.log("  /contact");
console.log("  /hosts");
console.log("  /about");
console.log("  public footer");
