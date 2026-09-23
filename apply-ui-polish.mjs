import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value, "utf8");
}

function replaceOnce(source, from, to, label) {
  const idx = source.indexOf(from);
  if (idx < 0) {
    throw new Error(`Could not find expected text for: ${label}`);
  }
  return source.slice(0, idx) + to + source.slice(idx + from.length);
}

function update(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (after === before) {
    throw new Error(`No changes produced for ${path}`);
  }
  write(path, after);
  console.log(`updated ${path}`);
}

update("app/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    '<div className="shell hero-layout">',
    '<div className={`shell hero-layout ${featuredStay ? "" : "hero-layout-single"}`}>',
    "homepage hero layout"
  );

  const start = s.indexOf(
    '          <div className="hero-featured-panel" aria-label="Featured stay">',
  );
  const heroClose = s.indexOf(
    '        </div>\n      </div>\n\n      <main>',
    start,
  );

  if (start < 0 || heroClose < 0) {
    throw new Error("Could not locate homepage featured panel");
  }

  const newFeatured = `          {featuredStay ? (
            <div className="hero-featured-panel" aria-label="Featured stay">
              <TrackedLink
                className="hero-featured-media hero-featured-live"
                href={\`/stays/\${featuredStay.slug}\`}
                prefetch={false}
                aria-label={\`View \${featuredStay.name}\`}
                eventName="property_click"
                eventData={{
                  slug: featuredStay.slug,
                  surface: "home_featured",
                  trigger: "image",
                }}
              >
                {featuredStay.image ? (
                  <img
                    src={featuredStay.image}
                    alt={\`\${featuredStay.name} in \${featuredStay.location}\`}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                ) : (
                  <div
                    className="hero-featured-photo-placeholder"
                    aria-label="Property photo unavailable"
                  />
                )}
                <span>Featured stay</span>
              </TrackedLink>

              <div className="hero-featured-copy">
                <span>{featuredStay.location}</span>
                <strong>{featuredStay.name}</strong>
                <p>
                  {featuredStay.sleeps} guests · {featuredStay.type}
                  {featuredStay.tags.length
                    ? \` · \${featuredStay.tags.slice(0, 2).join(" · ")}\`
                    : ""}
                </p>
                <div className="hero-featured-meta">
                  <b>\${featuredStay.price}</b>
                  <small>/ night</small>
                </div>
                <TrackedLink
                  href={\`/stays/\${featuredStay.slug}\`}
                  prefetch={false}
                  eventName="property_click"
                  eventData={{
                    slug: featuredStay.slug,
                    surface: "home_featured",
                    trigger: "text",
                  }}
                >
                  View this stay →
                </TrackedLink>
              </div>
            </div>
          ) : null}
`;

  s = s.slice(0, start) + newFeatured + s.slice(heroClose);

  s = replaceOnce(
    s,
    `              <div className="featured-empty home-inventory-empty">
                <div>
                  <p className="eyebrow dark">The first stays are on the way</p>
                  <h3>We’re getting the first places ready for travelers.</h3>
                  <p>
                    As approved hosts publish their properties, they’ll start
                    showing up here.
                  </p>
                </div>
                <TrackedLink
                  className="button button-quiet"
                  href="/hosts"
                  eventName="host_cta_click"
                  eventData={{ surface: "home_inventory_empty" }}
                >
                  List a property
                </TrackedLink>
              </div>`,
    `              <div className="featured-empty home-inventory-empty">
                <div>
                  <p className="eyebrow dark">No stays to show here right now</p>
                  <h3>Try another destination or check back soon.</h3>
                  <p>
                    Published stays will appear here as they become available.
                  </p>
                </div>
              </div>`,
    "homepage inventory empty state",
  );

  return s;
});

update("components/PropertyCard.tsx", (s) =>
  replaceOnce(
    s,
    `          <div className="property-image property-image-empty">
            Photo coming soon
          </div>`,
    `          <div
            className="property-image property-image-empty"
            aria-label="Property photo unavailable"
          />`,
    "property card image fallback",
  ),
);

update("app/stays/[slug]/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `<div className="gallery-main gallery-placeholder">Property photo</div>`,
    `<div
              className="gallery-main gallery-placeholder gallery-brand-placeholder"
              aria-label="Property photo unavailable"
            />`,
    "main gallery fallback",
  );

  s = replaceOnce(
    s,
    `<div className="gallery-placeholder">Property photo</div>`,
    `<div
              className="gallery-placeholder gallery-brand-placeholder"
              aria-label="Property photo unavailable"
            />`,
    "second gallery fallback",
  );

  s = replaceOnce(
    s,
    `<div className="gallery-placeholder">Property photo</div>`,
    `<div
              className="gallery-placeholder gallery-brand-placeholder"
              aria-label="Property photo unavailable"
            />`,
    "third gallery fallback",
  );

  s = replaceOnce(
    s,
    `<span>Amenities are being finalized.</span>`,
    `<span>No additional amenities listed.</span>`,
    "amenities empty state",
  );

  return s;
});

update("components/StayResults.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `<span>· Availability is rechecked again before checkout</span>`,
    `<span>· Availability is confirmed again before checkout</span>`,
    "availability wording",
  );

  s = replaceOnce(
    s,
    `{inventoryEmpty ? "More places are coming" : "Nothing matched"}`,
    `{inventoryEmpty ? "No stays available right now" : "Nothing matched"}`,
    "results empty eyebrow",
  );

  s = replaceOnce(
    s,
    `? "We’re still getting the first places ready."`,
    `? "There aren’t any published stays to show here right now."`,
    "results empty heading",
  );

  s = replaceOnce(
    s,
    `? "New stays will show up here as hosts finish getting them ready."`,
    `? "Try another destination or check back soon."`,
    "results empty body",
  );

  return s;
});

update("app/checkout/page.tsx", (s) =>
  replaceOnce(
    s,
    `<h1>Online booking opens soon.</h1>
          <p>
            Dates and secure checkout are currently unavailable.
          </p>`,
    `<h1>Booking is temporarily unavailable.</h1>
          <p>
            Browse stays for now and try checkout again shortly.
          </p>`,
    "checkout disabled state",
  ),
);

update("components/HostOnboardingWizard.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `            <p>
              This creates the host organization used by the dashboard,
              guest contact details and admin team.
            </p>`,
    `            <p>
              Add the name and contact details guests and Find A Place should use.
            </p>`,
    "host profile helper",
  );

  s = replaceOnce(
    s,
    `<h2>Upload the actual listing photos now.</h2>
            <p>
              These photos save directly to the real draft property, so
              you will not have to upload them again after onboarding.
            </p>`,
    `<h2>Add your listing photos.</h2>
            <p>
              Photos added here stay with this property and will appear on the listing.
            </p>`,
    "onboarding photos copy",
  );

  s = replaceOnce(
    s,
    `            <p>
              Save the preferred calendar approach here. Calendar
              connections can be added after the listing is created;
              your choice here is carried into the real property record.
            </p>`,
    `            <p>
              Choose how you want availability managed. Calendar connections can
              be added after the listing is created.
            </p>`,
    "onboarding calendar copy",
  );

  s = replaceOnce(
    s,
    `<h2>Connect Stripe before you finish onboarding.</h2>
            <p>
              Complete the same secure Stripe Connect flow used by
              Payments &amp; taxes here. Once Stripe is ready, you will
              not need to repeat this setup after onboarding.
            </p>`,
    `<h2>Connect Stripe before you finish.</h2>
            <p>
              Connect the Stripe account that will receive guest payments. Once
              it is ready, you will not need to set it up again.
            </p>`,
    "onboarding Stripe copy",
  );

  s = replaceOnce(
    s,
    `<h2>Finish setup and create {propertyLabel}.</h2>`,
    `<h2>Review and finish {propertyLabel}.</h2>`,
    "review heading",
  );

  s = replaceOnce(
    s,
    `<small>
                  Photos are already attached to the real listing draft.
                </small>`,
    `<small>
                  These photos are attached to this listing.
                </small>`,
    "review photos copy",
  );

  s = replaceOnce(
    s,
    `<small>
                  Guest payments use the host-owned connected Stripe
                  account.
                </small>`,
    `<small>
                  Guest payments are processed through your connected Stripe account.
                </small>`,
    "review Stripe copy",
  );

  const planStart = s.indexOf('      <aside className="onboarding-plan">');
  const planEnd = s.indexOf('      </aside>\n    </div>\n  );', planStart);

  if (planStart < 0 || planEnd < 0) {
    throw new Error("Could not locate onboarding side explainer");
  }

  s = s.slice(0, planStart) + s.slice(planEnd + '      </aside>\n'.length);
  return s;
});

update("components/OnboardingPhotoManager.tsx", (input) => {
  let s = input;

  const replacements = [
    [
      "Preparing the real listing photo storage…",
      "Preparing your listing photos…",
      "photo initial status",
    ],
    [
      "Unable to prepare property photo storage. Save the property name and try again.",
      "Unable to load listing photos. Save the property name and try again.",
      "photo load error",
    ],
    [
      "Unable to prepare property photo storage.",
      "Unable to load listing photos.",
      "photo fallback error",
    ],
    [
      "Photo storage is ready. Upload at least one photo before finishing setup.",
      "Add at least one photo before finishing setup.",
      "photo ready message",
    ],
    [
      "Uploading property photos…",
      "Uploading photos…",
      "photo upload status",
    ],
    [
      "saved to the real listing. You will not need to upload them again later.",
      "saved to this listing.",
      "photo saved message",
    ],
    [
      "The photo was removed from the listing, but its old stored file needs cleanup.",
      "The photo was removed from the listing, but cleanup could not be completed. You can continue setup.",
      "photo cleanup error",
    ],
    [
      "Preparing photo storage",
      "Preparing photos",
      "photo status heading",
    ],
    [
      "Connected to listing draft",
      "Saved with this listing",
      "photo saved badge",
    ],
    [
      `These are the actual files used by the property listing. Finishing
        onboarding will keep them attached to the listing automatically.`,
      "Photos added here stay attached to this listing when you finish setup.",
      "photo help",
    ],
  ];

  for (const [from, to, label] of replacements) {
    s = replaceOnce(s, from, to, label);
  }

  return s;
});

update("components/payments/OnboardingStripeSetup.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `"Stripe setup is temporarily unavailable because the publishable key is not configured.",`,
    `"Stripe setup is temporarily unavailable. Try again shortly.",`,
    "Stripe missing-key UI",
  );

  s = replaceOnce(
    s,
    `? "Stripe is connected and ready for guest payments. Nothing else is required in Payments & taxes after onboarding."`,
    `? "Stripe is connected and ready for guest payments."`,
    "Stripe ready UI",
  );

  return s;
});

update("app/find-a-place-theme.css", (input) => {
  if (input.includes("/* UI polish pass: production-safe fallbacks")) {
    throw new Error("UI polish CSS already appears to be applied.");
  }

  return (
    input +
    `

/* UI polish pass: production-safe fallbacks and a simpler host setup layout. */
.hero-layout.hero-layout-single {
  grid-template-columns: minmax(0, 1fr);
}
.hero-layout.hero-layout-single .hero-copy {
  max-width: 900px;
}

.property-image-empty,
.gallery-brand-placeholder,
.hero-featured-photo-placeholder {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 70% 25%, rgba(255,255,255,.5), transparent 28%),
    linear-gradient(135deg, #ddd6ca, #c8c2b7 52%, #aeb8aa);
}
.property-image-empty::after,
.gallery-brand-placeholder::after,
.hero-featured-photo-placeholder::after {
  content: "";
  width: 72px;
  height: 72px;
  background: url("/brand/find-a-place-seal.png") center / contain no-repeat;
  opacity: .28;
}
.gallery-brand-placeholder::after {
  width: 86px;
  height: 86px;
}
.property-image-empty {
  min-height: 100%;
}

.wizard.near-production-wizard {
  grid-template-columns: 190px minmax(0, 1fr);
}
.wizard.near-production-wizard .wizard-panel {
  max-width: 900px;
}

@media (max-width: 1100px) {
  .hero-layout.hero-layout-single {
    grid-template-columns: minmax(0, 1fr);
  }
  .wizard.near-production-wizard {
    grid-template-columns: 180px minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  .wizard.near-production-wizard {
    display: block;
  }
}
`
  );
});


update("app/host/payments/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `? \`Guest payments are charged directly on this host Stripe account for \${\n                  workspace.environment === "TEST"\n                    ? "test"\n                    : "live"\n                } bookings. Stripe handles processing, balance availability and bank deposits.\``,
    `? "Guest payments are charged directly on this host Stripe account. Stripe handles processing, balance availability and bank deposits."`,
    "host payment account environment wording",
  );

  s = replaceOnce(
    s,
    `<div>
          <span>Payment mode</span>
          <strong>
            {workspace.environment === "TEST" ? "Test" : "Live"}
          </strong>
          <small>
            {workspace.environment === "TEST"
              ? "Stripe test data only"
              : "Real guest payments"}
          </small>
        </div>`,
    `<div>
          <span>Bank deposits</span>
          <strong>Stripe managed</strong>
          <small>Stripe controls balance availability and payout timing</small>
        </div>`,
    "host payment mode metric",
  );

  return s;
});

update("app/host/reports/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `          <small>
            Guest charges belong to your connected processor account. TEST and
            LIVE records remain separate.
          </small>`,
    `          <small>
            Reports include the booking and payment records available to this host account.
          </small>`,
    "host report environment helper",
  );

  s = replaceOnce(
    s,
    `          <span className="status-pill status-muted">
            {report.environment} money
          </span>`,
    "",
    "host report environment pill",
  );

  return s;
});

update("app/host/properties/new/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `<p className="eyebrow dark">New draft listing</p><h2>Create the real property record first.</h2><p>Start with the identity and public area. The full editor opens immediately after creation so you can add address, capacity, photos, amenities, policies, rates and notification routing.</p>`,
    `<p className="eyebrow dark">New property</p><h2>Start the property listing.</h2><p>Add the name, type and public area first. The full editor opens next so you can finish the address, capacity, photos, amenities, policies, rates and notification settings.</p>`,
    "new property intro",
  );

  s = replaceOnce(
    s,
    `<div className="full new-property-actions"><Link className="button button-quiet" href="/host/properties">Cancel</Link><button className="button" type="submit">Create draft property →</button></div>`,
    `<div className="full new-property-actions"><Link className="button button-quiet" href="/host/properties">Cancel</Link><button className="button" type="submit">Create property →</button></div>`,
    "new property button",
  );

  return s;
});

update("app/admin/hosts/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `<p className="muted">This searches real host identities and organizations. Open a host to see its onboarding state; real properties are also available in the Properties workspace.</p>`,
    `<p className="muted">Search host accounts and organizations. Open a host to review onboarding, account details and connected properties.</p>`,
    "admin host helper",
  );

  s = replaceOnce(
    s,
    `Host lookup failed. Refresh and try again. If the problem continues, verify the admin database foundation is current.`,
    `Host lookup failed. Refresh and try again. If the problem continues, check platform status or contact support.`,
    "admin host error",
  );

  return s;
});

update("app/admin/properties/page.tsx", (input) =>
  replaceOnce(
    input,
    `Property lookup failed. Confirm the latest database migrations were applied.`,
    `Property lookup failed. Refresh and try again. If the problem continues, check platform status.`,
    "admin property error",
  ),
);


update("components/PropertyEditor.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `const [message, setMessage] = useState("Loaded from the production property record.");`,
    `const [message, setMessage] = useState("Property details loaded.");`,
    "property editor initial message",
  );

  s = replaceOnce(
    s,
    `{images.length ? <div className="property-image-grid">{images.map((image, index) => <figure key={image.id}>{image.signedUrl ? <img src={image.signedUrl} alt={image.altText || form.name || "Property"} /> : <div className="property-image-missing">Preview unavailable</div>}<figcaption><span>{index === 0 ? "Primary photo" : image.originalName || \`Photo \${index + 1}\`}</span><button type="button" disabled={uploading} onClick={() => void removeImage(image)}>Remove</button></figcaption></figure>)}</div> : <div className="panel-empty"><strong>No real photos uploaded yet.</strong><span>The filenames saved during host onboarding were only draft references. Upload the actual image files here.</span></div>}`,
    `{images.length ? <div className="property-image-grid">{images.map((image, index) => <figure key={image.id}>{image.signedUrl ? <img src={image.signedUrl} alt={image.altText || form.name || "Property"} /> : <div className="property-image-missing">Preview unavailable</div>}<figcaption><span>{index === 0 ? "Primary photo" : image.originalName || \`Photo \${index + 1}\`}</span><button type="button" disabled={uploading} onClick={() => void removeImage(image)}>Remove</button></figcaption></figure>)}</div> : <div className="panel-empty"><strong>No photos uploaded yet.</strong><span>Add at least one property photo before submitting the listing for review.</span></div>}`,
    "property editor photo empty state",
  );

  s = replaceOnce(
    s,
    `<div className="connection-card"><div className="connection-icon">↻</div><div><strong>Calendar preference is real; the connection is not yet active.</strong><span>iCal/PMS URLs, sync health and availability ingestion will appear when calendar sync is enabled.</span></div><button className="button button-small" type="button" disabled>Connect calendar</button></div>`,
    `<div className="connection-card"><div className="connection-icon">↻</div><div><strong>Manage calendar connections and availability in one place.</strong><span>Connect iCal feeds, review sync status and block dates from the Calendar workspace.</span></div><Link className="button button-small" href="/host/calendar">Open calendar</Link></div>`,
    "property editor calendar card",
  );

  s = replaceOnce(
    s,
    `<div className="property-editor-footer"><div><strong>{liveEditable ? "Editable live property record" : editable ? "Editable property record" : "Reviewed property record"}</strong><span>{liveEditable ? initial.status === "PUBLISHED" ? "Saving updates the live guest-facing listing immediately. Operational rates, availability, taxes and payment settings stay in their dedicated tools." : "Saving updates this paused property record without changing its publication state." : editable ? "Saving updates the property record but does not publish the listing or accept bookings." : "This state is protected from host-side edits until the review/publication workflow returns it for changes."}</span></div><button type="button" className="button" disabled={saving || !editable} onClick={save}>{saving ? "Saving…" : liveEditable ? "Save live changes" : editable ? "Save property" : "Editing locked"}</button></div>`,
    `<div className="property-editor-footer"><div><strong>{liveEditable ? "Listing changes" : editable ? "Property details" : "Listing review"}</strong><span>{liveEditable ? initial.status === "PUBLISHED" ? "Saving updates the live guest-facing listing immediately. Rates, availability, taxes and payment settings stay in their dedicated tools." : "Saving updates this paused listing without changing its publication state." : editable ? "Saving keeps your listing changes without publishing them." : "Editing is locked while this listing is in review."}</span></div><button type="button" className="button" disabled={saving || !editable} onClick={save}>{saving ? "Saving…" : liveEditable ? "Save live changes" : editable ? "Save property" : "Editing locked"}</button></div>`,
    "property editor footer",
  );

  s = replaceOnce(
    s,
    `<div className="property-url-card"><small>Reserved booking URL</small><strong>/stays/{form.slug}</strong><p>Stable internal property ID: <code>{initial.propertyId.slice(0, 8)}…</code></p>{initial.oldSlugs.length ? <div><span>Old URLs preserved</span>{initial.oldSlugs.slice(0, 4).map((slug) => <code key={slug}>/stays/{slug}</code>)}</div> : null}</div>`,
    `<div className="property-url-card"><small>Booking URL</small><strong>/stays/{form.slug}</strong><p>This is the public listing address once the property is published.</p></div>`,
    "property editor URL card",
  );

  return s;
});

update("components/BookingCard.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `<strong>Online booking opens soon</strong>`,
    `<strong>Online booking is unavailable</strong>`,
    "booking card unavailable label",
  );

  s = replaceOnce(
    s,
    `<strong>Save this one for later.</strong>
          <p>Online dates and secure checkout will open soon.</p>`,
    `<strong>This stay cannot be booked online right now.</strong>
          <p>Browse the listing details and check back later.</p>`,
    "booking card unavailable body",
  );

  s = replaceOnce(
    s,
    `Online booking coming soon`,
    `Booking unavailable`,
    "booking card unavailable button",
  );

  return s;
});

update("components/BookingConfirmation.tsx", (input) =>
  replaceOnce(
    input,
    `          Payment status: {booking.paymentStatus}. This page checks
          automatically while the signed Stripe webhook completes the booking.`,
    `          We are waiting for payment confirmation. This page will update
          automatically when the reservation is ready.`,
    "booking confirmation pending copy",
  ),
);

update("app/host/settings/page.tsx", (input) =>
  replaceOnce(
    input,
    `This is the name guests see. It can be different from the internal organization name.`,
    `This is the name guests see. It can be different from the organization name on your account.`,
    "host settings organization helper",
  ),
);

update("app/admin/audit/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `Technical event codes stay underneath for support/debugging.`,
    `Technical event codes remain available underneath for support and troubleshooting.`,
    "admin audit helper",
  );

  s = replaceOnce(
    s,
    `Platform activity could not be loaded. Apply migration 068 and
            refresh.`,
    `Platform activity could not be loaded. Refresh and try again. If the
            problem continues, check platform status.`,
    "admin audit error",
  );

  return s;
});

update("app/admin/content/page.tsx", (input) =>
  replaceOnce(
    input,
    `if (error) throw new Error("Unable to load managed site content. Apply the latest content migration and refresh.");`,
    `if (error) throw new Error("Unable to load managed site content. Refresh and try again. If the problem continues, check platform status.");`,
    "admin content load error",
  ),
);

update("app/admin/hosts/[profileId]/page.tsx", (input) => {
  let s = input;

  s = replaceOnce(
    s,
    `<div className="panel-empty"><strong>No host organization yet.</strong><span>The signed-in host creates the first real organization when they begin \`/host/onboarding\`.</span></div>`,
    `<div className="panel-empty"><strong>No host organization yet.</strong><span>A host organization will appear here after the host begins setup.</span></div>`,
    "admin host organization empty state",
  );

  s = replaceOnce(
    s,
    `<div className="panel-head"><div><p className="eyebrow dark">Properties</p><h2>Real listing records</h2></div><Link href="/admin/properties">All properties</Link></div>`,
    `<div className="panel-head"><div><p className="eyebrow dark">Properties</p><h2>Listing records</h2></div><Link href="/admin/properties">All properties</Link></div>`,
    "admin host property heading",
  );

  s = replaceOnce(
    s,
    `<div className="panel-empty"><strong>No property records yet.</strong><span>Once the host converts onboarding into a real draft property, it will appear here.</span></div>`,
    `<div className="panel-empty"><strong>No property records yet.</strong><span>Once the host creates a property from setup, it will appear here.</span></div>`,
    "admin host property empty state",
  );

  return s;
});

console.log("\nUI polish applied. Editable Supabase/CMS content was not touched.");
console.log("Next: npm run typecheck && npm run build");
