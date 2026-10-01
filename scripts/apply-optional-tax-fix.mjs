import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing expected file: ${rel}`);
  }
  return fs.readFileSync(p, "utf8");
}

function write(rel, value) {
  fs.writeFileSync(path.join(root, rel), value, "utf8");
}

function replaceExact(content, oldText, newText, label) {
  if (content.includes(newText)) {
    console.log(`Already patched: ${label}`);
    return content;
  }
  if (!content.includes(oldText)) {
    throw new Error(`Could not find expected source for: ${label}`);
  }
  console.log(`Patched: ${label}`);
  return content.replace(oldText, newText);
}

function replaceRegex(content, pattern, replacement, label, alreadyPattern = null) {
  if (alreadyPattern && alreadyPattern.test(content)) {
    console.log(`Already patched: ${label}`);
    return content;
  }
  if (!pattern.test(content)) {
    throw new Error(`Could not find expected source for: ${label}`);
  }
  console.log(`Patched: ${label}`);
  return content.replace(pattern, replacement);
}

// ---------------------------------------------------------------------------
// Host onboarding: taxes stay visible/helpful, but are no longer required.
// ---------------------------------------------------------------------------

{
  const rel = "components/HostOnboardingWizard.tsx";
  let content = read(rel);

  content = replaceRegex(
    content,
    /\n    if \(\n      step === 6 &&\n      form\.taxResponsibilityAccepted !== "true"\n    \) \{\n      return "Review the property tax setup and confirm the host tax responsibility before continuing\.";\n    \}\n/,
    "\n",
    "remove tax-step validation gate",
  );

  content = replaceExact(
    content,
    `      form.taxResponsibilityAccepted !== "true" &&
        "property tax responsibility confirmation",
`,
    "",
    "remove tax requirement from final completion checklist",
  );

  content = replaceExact(
    content,
    `"Finalizing the listing, taxes, photos, payment connection and property record…"`,
    `"Finalizing the listing, photos, payment connection and property record…"`,
    "remove taxes from required finalization message",
  );

  content = replaceExact(
    content,
    `<p className="eyebrow dark">Property taxes</p>
            <h2>
              Confirm the taxes that apply to {propertyLabel}.
            </h2>
            <p>
              The setup follows the property's state. Find A Place
              automatically applies the active statewide rules for
              supported states, while the host enters and confirms
              the local taxes for this property.
            </p>`,
    `<p className="eyebrow dark">Property taxes</p>
            <h2>
              Add guest taxes if you want Find A Place to collect them.
            </h2>
            <p>
              This step is optional. If you want taxes added to guest
              checkout, configure and confirm them here. If you handle
              taxes yourself, leave the setup unconfirmed and continue;
              it will not block publishing or bookings.
            </p>`,
    "make onboarding tax step optional",
  );

  content = replaceExact(
    content,
    `{form.taxResponsibilityAccepted === "true"
                    ? "Configured"
                    : "Required"}`,
    `{form.taxResponsibilityAccepted === "true"
                    ? "Configured for checkout"
                    : "Optional · host handles separately"}`,
    "change tax review status",
  );

  content = replaceExact(
    content,
    `{taxSetup.name} · statewide rules automatic ·{" "}
                  {configuredLocalTaxLines} local tax{" "}
                  {configuredLocalTaxLines === 1
                    ? "line"
                    : "lines"}`,
    `{form.taxResponsibilityAccepted === "true"
                    ? taxSetup.name +
                      " · " +
                      configuredLocalTaxLines +
                      " local tax " +
                      (configuredLocalTaxLines === 1 ? "line" : "lines")
                    : "No guest tax will be added by Find A Place"}`,
    "change tax review detail",
  );

  content = replaceExact(
    content,
    `The completion check verifies required listing data,
                at least one real photo, the host-certified tax setup,
                Stripe charge/payout readiness and the host policy
                acceptance before publication is attempted.`,
    `The completion check verifies required listing data,
                at least one real photo, Stripe charge/payout readiness
                and the host policy acceptance before publication is
                attempted. Tax setup is optional.`,
    "remove tax from ready requirements copy",
  );

  content = replaceExact(
    content,
    `I confirm that I have authority to manage/list the
                property information entered here and that the host
                information, property policies and tax setup are
                accurate.`,
    `I confirm that I have authority to manage/list the
                property information entered here and that the host
                information and property policies are accurate.`,
    "remove tax from final authority confirmation",
  );

  write(rel, content);
}

// ---------------------------------------------------------------------------
// Onboarding completion API: save tax setup only when host opts in.
// ---------------------------------------------------------------------------

{
  const rel = "app/api/host/onboarding/complete/route.ts";
  let content = read(rel);

  content = replaceRegex(
    content,
    /\nconst SUPPORTED_TAX_STATES = new Set\(\[\n  "AR",\n  "MO",\n  "TX",\n  "TN",\n\]\);\n/,
    "\n",
    "remove supported-tax-state hard gate",
  );

  content = replaceExact(
    content,
    `"Unable to load the saved onboarding tax setup."`,
    `"Unable to load the saved onboarding details."`,
    "generalize onboarding draft error",
  );

  const taxBlockPattern =
    /\n    const propertyState = cleanText\([\s\S]*?\n    const admin = createAdminClient\(\);/;

  const taxBlockReplacement = `
    // Tax collection is optional. When the host opts in, persist the
    // certified setup and use it at guest checkout. When the host leaves
    // it off, publishing/booking continues and Find A Place adds $0 tax.
    if (form.taxResponsibilityAccepted === "true") {
      let taxLines;
      try {
        taxLines = parseOnboardingTaxLines(
          form.taxLinesJson,
        );
      } catch (taxParseError) {
        return NextResponse.json(
          {
            error:
              taxParseError instanceof Error
                ? taxParseError.message
                : "The property tax setup is invalid.",
            code: "TAX_SETUP_INVALID",
          },
          { status: 409 },
        );
      }

      const { error: taxSetupError } = await supabase.rpc(
        "host_save_property_tax_configuration_v2",
        {
          target_property_id: prepared.property_id,
          county_name_value:
            cleanText(form.taxCounty, 120) || null,
          locality_name_value:
            cleanText(form.taxLocality, 120) ||
            cleanText(form.city, 120) ||
            null,
          tax_lines_value: taxLines,
          responsibility_ack_value: true,
        },
      );

      if (taxSetupError) {
        console.error(
          "[complete host onboarding] tax setup",
          taxSetupError,
        );
        return NextResponse.json(
          {
            error:
              taxSetupError.message ||
              "Unable to save the property tax setup.",
            code: "TAX_SETUP_FAILED",
          },
          { status: 409 },
        );
      }
    }

    const admin = createAdminClient();`;

  content = replaceRegex(
    content,
    taxBlockPattern,
    taxBlockReplacement,
    "make onboarding tax persistence opt-in",
    /Tax collection is optional\. When the host opts in/,
  );

  write(rel, content);
}

// ---------------------------------------------------------------------------
// Tax setup component copy: explain optional checkout tax clearly.
// ---------------------------------------------------------------------------

{
  const rel = "components/onboarding/OnboardingTaxSetup.tsx";
  let content = read(rel);

  content = replaceExact(
    content,
    `<strong>Statewide rules are handled automatically.</strong>
        <p>
          {config.intro} You only need to enter the local taxes that
          apply to this specific property.
        </p>`,
    `<strong>Optional guest tax collection.</strong>
        <p>
          {config.intro} If you want Find A Place to add taxes to guest
          checkout, enter the local taxes that apply and confirm the
          setup below. If you handle taxes yourself, you can leave this
          unconfirmed and continue.
        </p>`,
    "clarify optional tax collection",
  );

  content = replaceExact(
    content,
    `No local tax lines added. Add one only when a local tax
              applies to this property.`,
    `No local tax lines added. You can leave this blank when you
              handle taxes separately.`,
    "clarify empty tax state",
  );

  content = replaceExact(
    content,
    `I confirm that this tax setup is accurate for this property.
          I understand that guest tax funds remain in my connected
          payment account and that I am responsible for the applicable
          filing and remittance obligations.`,
    `Use this tax setup at guest checkout. I confirm that it is
          accurate for this property and understand that the tax funds
          remain in my connected payment account for my filing and
          remittance obligations.`,
    "make tax certification an opt-in control",
  );

  write(rel, content);
}

// ---------------------------------------------------------------------------
// Payments & taxes page copy: optional, not a readiness blocker.
// ---------------------------------------------------------------------------

{
  const rel = "app/host/payments/page.tsx";
  let content = read(rel);

  content = replaceExact(
    content,
    `<h2>Tax setup follows each property's location.</h2>
            <p>
              You only see tax setup for states where you have properties.
              Find A Place adds the configured guest taxes to checkout, but
              the tax money remains in your connected Stripe charge.
            </p>`,
    `<h2>Guest tax collection is optional for each property.</h2>
            <p>
              Configure taxes here if you want Find A Place to add them to
              guest checkout. If you handle taxes yourself, leave the property
              unconfigured; publishing and bookings still work and Find A
              Place adds $0 tax.
            </p>`,
    "payments page optional-tax intro",
  );

  content = replaceExact(
    content,
    `? "Confirm setup"
                                    : "Needs setup"`,
    `? "Review setup"
                                    : "Optional"`,
    "payments page optional tax status",
  );

  content = replaceExact(
    content,
    `<span>Automatically included</span>`,
    `<span>Applied when guest tax collection is enabled</span>`,
    "payments page automatic rules label",
  );

  content = replaceExact(
    content,
    `This property has an older tax setup. Review the
                                migrated local tax lines below and certify them
                                so responsibility is recorded to the host.`,
    `This property has an older tax setup. Review and
                                certify it if you want Find A Place to add these
                                taxes to guest checkout.`,
    "payments page legacy tax copy",
  );

  content = replaceExact(
    content,
    `Certification is required before a new
                                      property can use live checkout.`,
    `Optional. Leave this unconfigured if you
                                      handle taxes separately.`,
    "payments page remove live-checkout tax warning",
  );

  content = replaceExact(
    content,
    `Need help? Find A Place admins can enter or correct a property's tax
          setup, but the host still reviews and certifies the final
          configuration.`,
    `Need help? Find A Place admins can help with a property's tax setup.
          Tax setup is optional and does not block publishing or checkout; the
          host remains responsible for applicable filing and remittance.`,
    "payments page support note",
  );

  write(rel, content);
}

console.log("");
console.log("Optional tax source patch applied successfully.");
console.log("Next: apply supabase/migrations/20261001150000_optional_host_tax_checkout.sql");
console.log("Then run: npm run typecheck && npm run build");
