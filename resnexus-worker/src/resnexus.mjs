import { createHash } from "node:crypto";

export class NeedsAttentionError extends Error {
  constructor(code, message, diagnostic = {}) {
    super(message);
    this.name = "NeedsAttentionError";
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

export class UnsafeExtractionError extends Error {
  constructor(message, diagnostic = {}) {
    super(message);
    this.name = "UnsafeExtractionError";
    this.diagnostic = diagnostic;
  }
}

const LOGIN_URL =
  process.env.RESNEXUS_LOGIN_URL?.trim() ||
  "https://resnexus.com/resnexus/v6/backoffice/authenticate/Index";

const CALENDAR_URL =
  process.env.RESNEXUS_CALENDAR_URL?.trim() ||
  "https://resnexus.com/resnexus/v6/backoffice/reservations/calendar/Index";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedResource(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableHash(value, length = 48) {
  return createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, length);
}

function resourceKey(label) {
  const normalized = normalizedResource(label);
  return normalized ? `RNRES:${stableHash(normalized, 32)}` : null;
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

function isoDate(value) {
  if (!value) return null;
  const raw = clean(value);

  let match = raw.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) {
    return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (match) {
    return validDate(Number(match[3]), Number(match[1]), Number(match[2]));
  }

  const months = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };

  match = raw.match(
    /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept?|October|Oct|November|Nov|December|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i,
  );

  if (match) {
    return validDate(
      Number(match[3]),
      months[match[1].toLowerCase()],
      Number(match[2]),
    );
  }

  return null;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/td|\/th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function labelledValue(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*(?:date)?\\s*[:#-]?\\s*([^\\n]{2,160})`,
      "i",
    );
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }

  return null;
}

function parseReservationDetail(html, href) {
  const text = stripHtml(html);

  if (/\bstatus\s*[:#-]?\s*(?:cancelled|canceled|void)\b/i.test(text)) {
    return null;
  }

  const start = isoDate(
    labelledValue(text, ["check[ -]?in", "arrival", "arrive"]),
  );
  const end = isoDate(
    labelledValue(text, ["check[ -]?out", "departure", "depart"]),
  );

  if (!start || !end || end <= start) return null;

  const resourceLabel =
    labelledValue(text, [
      "room(?:\\s*\\/\\s*unit)?",
      "room name",
      "unit",
      "unit name",
      "accommodation",
      "rental",
    ]) || null;

  const parsedUrl = new URL(href);
  const externalId =
    parsedUrl.searchParams.get("ID") ||
    parsedUrl.searchParams.get("id") ||
    labelledValue(text, [
      "confirmation(?:\\s*(?:number|no\\.?|#|id))?",
      "reservation(?:\\s*(?:number|no\\.?|#|id))?",
      "booking(?:\\s*(?:number|no\\.?|#|id))?",
    ]);

  return {
    key: `RESNEXUS:${
      externalId ||
      stableHash([href, start, end, resourceLabel].filter(Boolean).join("|"))
    }`,
    uid: externalId || stableHash(href),
    start,
    end,
    resourceLabel,
    source: "reservation_detail",
  };
}

function detectChallengeText(text) {
  const normalized = clean(text).toLowerCase();

  if (
    normalized.includes("captcha") ||
    normalized.includes("verify you are human") ||
    normalized.includes("i'm not a robot") ||
    normalized.includes("i am not a robot")
  ) {
    return {
      code: "CAPTCHA_REQUIRED",
      message:
        "ResNexus requested CAPTCHA/human verification. Find A Place will not bypass it.",
    };
  }

  if (
    normalized.includes("verification code") ||
    normalized.includes("security code") ||
    normalized.includes("one-time code") ||
    normalized.includes("authentication code")
  ) {
    return {
      code: "VERIFICATION_CODE_REQUIRED",
      message:
        "ResNexus requested a one-time verification code. Enter it in Find A Place and retry.",
    };
  }

  return null;
}

async function detectChallenge(page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const textChallenge = detectChallengeText(bodyText);

  const captchaVisible = await page
    .locator(
      'iframe[src*="captcha" i], iframe[src*="recaptcha" i], [class*="captcha" i], [id*="captcha" i]',
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (captchaVisible) {
    return {
      code: "CAPTCHA_REQUIRED",
      message:
        "ResNexus requested CAPTCHA/human verification. Find A Place will not bypass it.",
    };
  }

  const codeInputVisible = await page
    .locator(
      'input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i]',
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (codeInputVisible) {
    return (
      textChallenge || {
        code: "VERIFICATION_CODE_REQUIRED",
        message:
          "ResNexus requested a one-time verification code. Enter it in Find A Place.",
      }
    );
  }

  return textChallenge;
}

async function isLoginPage(page) {
  const login = page
    .locator(
      'input[type="email"], input[name*="email" i], input[name*="user" i], input[placeholder*="email" i]',
    )
    .first();
  const password = page.locator('input[type="password"]').first();

  return (
    (await login.isVisible().catch(() => false)) &&
    (await password.isVisible().catch(() => false))
  );
}

async function waitForAuthTransition(page, previousUrl) {
  await Promise.race([
    page
      .waitForURL((url) => url.toString() !== previousUrl, {
        timeout: 8_000,
      })
      .catch(() => null),
    page.waitForTimeout(1_500),
  ]);

  await page
    .waitForLoadState("domcontentloaded", {
      timeout: 8_000,
    })
    .catch(() => null);

  await page.waitForTimeout(700);
}

async function fillLogin(page, login, password) {
  const loginInput = page
    .locator(
      [
        'input[type="email"]',
        'input[autocomplete="username"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[name*="login" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="user" i]',
        'input[placeholder*="login" i]',
      ].join(", "),
    )
    .first();

  const passwordInput = page.locator('input[type="password"]').first();

  if (
    !(await loginInput.isVisible().catch(() => false)) ||
    !(await passwordInput.isVisible().catch(() => false))
  ) {
    throw new NeedsAttentionError(
      "LOGIN_FORM_CHANGED",
      "The ResNexus login page changed and the worker could not safely identify the login fields.",
    );
  }

  await loginInput.fill(login);
  await passwordInput.fill(password);

  const previousUrl = page.url();
  const submit = page
    .locator(
      [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[name*="login" i]',
        'input[name*="login" i]',
        'button[id*="login" i]',
        'input[id*="login" i]',
        'button:has-text("Login")',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        'input[value*="Login" i]',
        'input[value*="Log in" i]',
        'input[value*="Sign in" i]',
      ].join(", "),
    )
    .first();

  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
  } else {
    await passwordInput.press("Enter");
  }

  await waitForAuthTransition(page, previousUrl);
}

async function submitChallengeIfPossible(page, challengeCode) {
  if (!challengeCode) return false;

  const input = page
    .locator(
      'input[autocomplete="one-time-code"], input[name*="code" i], input[id*="code" i]',
    )
    .first();

  if (!(await input.isVisible().catch(() => false))) return false;

  await input.fill(challengeCode);

  const previousUrl = page.url();
  const submit = page
    .locator(
      [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[name*="verify" i]',
        'input[name*="verify" i]',
        'button:has-text("Verify")',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
      ].join(", "),
    )
    .first();

  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
  } else {
    await input.press("Enter");
  }

  await waitForAuthTransition(page, previousUrl);
  return true;
}

export async function ensureResNexusSession({
  context,
  login,
  password,
  challengeCode,
}) {
  const page = await context.newPage();

  try {
    await page.goto(CALENDAR_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    if (await isLoginPage(page)) {
      await fillLogin(page, login, password);
    }

    let challenge = await detectChallenge(page);

    if (challenge?.code === "VERIFICATION_CODE_REQUIRED" && challengeCode) {
      const submitted = await submitChallengeIfPossible(page, challengeCode);
      if (submitted) challenge = await detectChallenge(page);
    }

    if (challenge) {
      throw new NeedsAttentionError(challenge.code, challenge.message);
    }

    if (await isLoginPage(page)) {
      const text = clean(
        await page.locator("body").innerText().catch(() => ""),
      ).toLowerCase();

      if (
        text.includes("invalid") ||
        text.includes("incorrect") ||
        text.includes("failed")
      ) {
        throw new NeedsAttentionError(
          "CREDENTIALS_REJECTED",
          "ResNexus did not accept the saved login. Replace the login/password in Find A Place.",
        );
      }

      throw new NeedsAttentionError(
        "LOGIN_REQUIRED",
        "The saved ResNexus session expired and automatic sign-in did not complete.",
      );
    }

    const currentUrl = new URL(page.url());
    if (!currentUrl.hostname.toLowerCase().endsWith("resnexus.com")) {
      throw new UnsafeExtractionError(
        "ResNexus redirected the browser outside the expected domain.",
      );
    }

    if (!page.url().toLowerCase().includes("calendar")) {
      await page.goto(CALENDAR_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    }

    if (await isLoginPage(page)) {
      throw new NeedsAttentionError(
        "LOGIN_REQUIRED",
        "ResNexus returned to the login page after sign-in.",
      );
    }

    return page;
  } catch (error) {
    await page.close().catch(() => null);
    throw error;
  }
}

const START_KEYS = new Set([
  "start",
  "startdate",
  "start_date",
  "arrival",
  "arrivaldate",
  "arrival_date",
  "checkin",
  "checkindate",
  "check_in",
  "check_in_date",
]);

const END_KEYS = new Set([
  "end",
  "enddate",
  "end_date",
  "departure",
  "departuredate",
  "departure_date",
  "checkout",
  "checkoutdate",
  "check_out",
  "check_out_date",
]);

const ID_KEYS = [
  "reservationid",
  "reservation_id",
  "bookingid",
  "booking_id",
  "confirmationnumber",
  "confirmation_number",
  "id",
];

const RESOURCE_KEYS = [
  "roomname",
  "room_name",
  "unitname",
  "unit_name",
  "resourcename",
  "resource_name",
  "room",
  "unit",
  "resource",
  "accommodation",
  "rental",
];

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function valueForKeys(object, keys) {
  for (const [rawKey, value] of Object.entries(object)) {
    if (keys.includes(normalizedKey(rawKey))) return value;
  }

  return null;
}

function dateForSet(object, keySet) {
  for (const [rawKey, value] of Object.entries(object)) {
    if (keySet.has(normalizedKey(rawKey))) {
      const parsed = typeof value === "string" ? isoDate(value) : null;
      if (parsed) return parsed;
    }
  }

  return null;
}

function walkJson(value, path, output, diagnostic) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkJson(item, `${path}[${index}]`, output, diagnostic),
    );
    return;
  }

  if (!value || typeof value !== "object") return;

  const object = value;
  const start = dateForSet(object, START_KEYS);
  const end = dateForSet(object, END_KEYS);

  if (start && end && end > start) {
    const externalId = clean(valueForKeys(object, ID_KEYS) || "");
    const resourceLabel =
      clean(valueForKeys(object, RESOURCE_KEYS) || "") || null;
    const status = clean(
      valueForKeys(object, ["status", "reservationstatus", "state"]) || "",
    ).toLowerCase();

    if (!/(cancelled|canceled|void)/i.test(status)) {
      output.push({
        key: `RESNEXUS:${
          externalId ||
          stableHash([path, start, end, resourceLabel].filter(Boolean).join("|"))
        }`,
        uid: externalId || stableHash(path),
        start,
        end,
        resourceLabel,
        source: "json_response",
      });
      diagnostic.schemaPaths.add(path || "root");
    }
  }

  for (const [key, nested] of Object.entries(object)) {
    if (nested && typeof nested === "object") {
      walkJson(
        nested,
        path ? `${path}.${key}` : key,
        output,
        diagnostic,
      );
    }
  }
}

function uniqueBlocks(blocks) {
  const seen = new Set();
  const output = [];

  for (const block of blocks) {
    const key = [
      block.key,
      block.start,
      block.end,
      normalizedResource(block.resourceLabel),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(block);
  }

  return output;
}

async function collectReservationLinks(page) {
  return page
    .locator(
      'a[href*="reservation" i], a[href*="info.aspx" i], a[href*="booking" i], a[href*="maintenance" i], a[href*="block" i]',
    )
    .evaluateAll((anchors) => [
      ...new Set(
        anchors
          .map((anchor) => anchor.getAttribute("href"))
          .filter((value) => Boolean(value)),
      ),
    ])
    .catch(() => []);
}

async function collectDomDataBlocks(page) {
  return page
    .locator(
      "[data-start][data-end], [data-checkin][data-checkout], [data-arrival][data-departure]",
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const data = {};
        for (const [key, value] of Object.entries(element.dataset)) {
          data[key] = value;
        }

        const explicitCandidates = [];
        const contextCandidates = [];

        const add = (list, value) => {
          const cleaned = String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();

          if (
            cleaned.length >= 2 &&
            cleaned.length <= 180 &&
            !list.includes(cleaned)
          ) {
            list.push(cleaned);
          }
        };

        const addExplicitResourceAttributes = (node) => {
          if (!node) return;

          const dataset = node.dataset || {};
          [
            dataset.roomName,
            dataset.unitName,
            dataset.resourceName,
            dataset.siteName,
            dataset.room,
            dataset.unit,
            dataset.resource,
            dataset.site,
          ].forEach((value) => add(explicitCandidates, value));

          [
            "data-room-name",
            "data-unit-name",
            "data-resource-name",
            "data-site-name",
            "data-room",
            "data-unit",
            "data-resource",
            "data-site",
          ].forEach((attribute) =>
            add(explicitCandidates, node.getAttribute(attribute)),
          );
        };

        let ancestor = element;
        for (let depth = 0; ancestor && depth < 7; depth += 1) {
          addExplicitResourceAttributes(ancestor);
          ancestor = ancestor.parentElement;
        }

        const row = element.closest('tr, [role="row"]');
        if (row) {
          addExplicitResourceAttributes(row);

          const rowHeader = row.querySelector(
            'th, [role="rowheader"], [data-room-name], [data-unit-name], [data-resource-name], [data-site-name], [class*="room-name" i], [class*="unit-name" i], [class*="site-name" i]',
          );

          add(contextCandidates, rowHeader?.textContent);
        }

        const labelledAncestor = element.closest(
          '[class*="room" i], [class*="unit" i], [class*="resource" i], [class*="site" i]',
        );

        if (labelledAncestor && labelledAncestor !== element) {
          const labelNode = labelledAncestor.querySelector(
            '[data-room-name], [data-unit-name], [data-resource-name], [data-site-name], [class*="room-name" i], [class*="unit-name" i], [class*="site-name" i]',
          );
          add(contextCandidates, labelNode?.textContent);
        }

        return {
          ...data,
          __explicitResourceCandidates: explicitCandidates,
          __contextResourceCandidates: contextCandidates,
        };
      }),
    )
    .catch(() => []);
}

function resourceHintNoise(value) {
  const normalized = clean(value).toLowerCase();

  if (!normalized) return true;

  const exactNoise = new Set([
    "** view all **",
    "all unit types",
    "cabin",
    "cabins",
    "rv site [short-term]",
    "rv sites",
    "rate + taxes & fees",
    "czech",
    "dutch",
    "english (united states)",
    "french",
    "german",
    "hungarian",
    "khmer",
    "polish",
    "portuguese",
    "slovak",
    "slovenian",
    "spanish",
  ]);

  if (exactNoise.has(normalized)) return true;
  if (normalized.startsWith("all unit types ")) return true;
  if (normalized.startsWith("site length (ft):")) return true;

  return false;
}

function exactKnownResourceCandidate(candidates, knownLabels) {
  const byNormalized = new Map();

  for (const label of knownLabels) {
    const normalized = normalizedResource(label);
    if (!normalized || resourceHintNoise(label)) continue;

    const existing = byNormalized.get(normalized) ?? [];
    existing.push(label);
    byNormalized.set(normalized, existing);
  }

  for (const candidate of candidates) {
    const normalized = normalizedResource(candidate);
    if (!normalized) continue;

    const matches = byNormalized.get(normalized) ?? [];
    if (matches.length === 1) return matches[0];
  }

  return null;
}

async function resourceHintsFromPage(page) {
  const values = await page
    .locator(
      '[data-room-name], [data-unit-name], [data-resource-name], select option, [class*="room" i], [class*="unit" i]',
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const dataset = element.dataset || {};
          return (
            dataset.roomName ||
            dataset.unitName ||
            dataset.resourceName ||
            element.textContent ||
            ""
          );
        })
        .map((value) => String(value).replace(/\s+/g, " ").trim())
        .filter((value) => value.length >= 2 && value.length <= 160),
    )
    .catch(() => []);

  return [
    ...new Set(
      values.filter(
        (value) =>
          /[a-z]/i.test(value) &&
          !resourceHintNoise(value) &&
          !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value) &&
          !/^\d+\s*(days?|guests?|rooms?)?$/i.test(value) &&
          !/^(next|previous|today|month|week|calendar)$/i.test(value),
      ),
    ),
  ].slice(0, 250);
}

async function clickNextCalendarWindow(page) {
  const selectors = [
    '[aria-label*="next month" i]',
    '[title*="next month" i]',
    '[data-action*="next" i][data-action*="month" i]',
    'button:has-text("Next Month")',
    'a:has-text("Next Month")',
    '[aria-label="Next"]',
    '[title="Next"]',
  ];

  for (const selector of selectors) {
    const candidate = page.locator(selector).first();

    if (await candidate.isVisible().catch(() => false)) {
      const beforeText = await page
        .locator("body")
        .innerText()
        .catch(() => "");

      await candidate.click().catch(() => null);
      await page.waitForLoadState("domcontentloaded").catch(() => null);
      await page.waitForTimeout(900);

      const afterText = await page
        .locator("body")
        .innerText()
        .catch(() => "");

      return {
        advanced:
          stableHash(beforeText.slice(0, 5000)) !==
          stableHash(afterText.slice(0, 5000)),
        fingerprint: stableHash(
          `${page.url()}|${afterText.slice(0, 5000)}`,
        ),
      };
    }
  }

  return { advanced: false, fingerprint: null };
}

function blockInWindow(block, windowStart, windowEnd) {
  return block.end > windowStart && block.start < windowEnd;
}

function resourceCatalog(labels) {
  const byKey = new Map();

  for (const rawLabel of labels) {
    const label = clean(rawLabel);
    const key = resourceKey(label);

    if (!key || !label) continue;
    if (!byKey.has(key)) byKey.set(key, { key, label });
  }

  return [...byKey.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export async function readResNexusAccountAvailability({
  context,
  page,
  lookbackDays,
  lookaheadDays,
  maxCalendarPages,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = addDays(today, -Math.max(0, lookbackDays));
  const windowEnd = addDays(today, Math.max(30, lookaheadDays));

  const networkBlocks = [];
  const schemaPaths = new Set();
  const networkPaths = new Set();

  const onResponse = async (response) => {
    try {
      const url = response.url();
      const contentType = response.headers()["content-type"] || "";

      if (
        !/json/i.test(contentType) ||
        !/(calendar|reservation|availability|grid|booking)/i.test(url)
      ) {
        return;
      }

      const parsedUrl = new URL(url);
      if (!parsedUrl.hostname.toLowerCase().endsWith("resnexus.com")) {
        return;
      }

      const json = await response.json();
      networkPaths.add(parsedUrl.pathname);
      walkJson(json, "", networkBlocks, { schemaPaths });
    } catch {
      // Best-effort discovery only.
    }
  };

  page.on("response", onResponse);

  const discoveredResourceLabels = new Set();
  const detailLinks = new Set();
  const domBlocks = [];
  const unresolvedDomSamples = [];
  const pageFingerprints = new Set();

  try {
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);

    const challenge = await detectChallenge(page);
    if (challenge) {
      throw new NeedsAttentionError(challenge.code, challenge.message);
    }

    for (let pageIndex = 0; pageIndex < maxCalendarPages; pageIndex += 1) {
      for (const label of await resourceHintsFromPage(page)) {
        discoveredResourceLabels.add(label);
      }

      for (const href of await collectReservationLinks(page)) {
        try {
          const absolute = new URL(href, page.url());
          if (absolute.hostname.toLowerCase().endsWith("resnexus.com")) {
            detailLinks.add(absolute.toString());
          }
        } catch {
          // Ignore malformed links.
        }
      }

      for (const data of await collectDomDataBlocks(page)) {
        const start =
          isoDate(data.start) ||
          isoDate(data.checkin) ||
          isoDate(data.arrival);
        const end =
          isoDate(data.end) ||
          isoDate(data.checkout) ||
          isoDate(data.departure);

        const explicitCandidates = Array.isArray(
          data.__explicitResourceCandidates,
        )
          ? data.__explicitResourceCandidates
          : [];

        const contextCandidates = Array.isArray(
          data.__contextResourceCandidates,
        )
          ? data.__contextResourceCandidates
          : [];

        const directResourceLabel =
          clean(
            data.roomName ||
              data.unitName ||
              data.resourceName ||
              data.siteName ||
              data.room ||
              data.unit ||
              data.resource ||
              data.site ||
              "",
          ) || null;

        const explicitResourceLabel =
          directResourceLabel ||
          explicitCandidates.find(
            (candidate) =>
              clean(candidate) &&
              !resourceHintNoise(candidate),
          ) ||
          null;

        const contextualResourceLabel =
          exactKnownResourceCandidate(
            contextCandidates,
            discoveredResourceLabels,
          );

        const resourceLabel =
          explicitResourceLabel ||
          contextualResourceLabel ||
          null;

        if (start && end && end > start) {
          const externalId = clean(
            data.reservationId ||
              data.bookingId ||
              data.confirmationNumber ||
              data.id ||
              "",
          );

          domBlocks.push({
            key: `RESNEXUS:${
              externalId ||
              stableHash(
                [
                  JSON.stringify(data),
                  start,
                  end,
                  resourceLabel,
                ].join("|"),
              )
            }`,
            uid: externalId || stableHash(JSON.stringify(data)),
            start,
            end,
            resourceLabel,
            source: "dom_dataset",
          });

          if (!resourceLabel && unresolvedDomSamples.length < 10) {
            unresolvedDomSamples.push({
              start,
              end,
              explicitCandidates: explicitCandidates
                .filter((candidate) => !resourceHintNoise(candidate))
                .slice(0, 8),
              contextCandidates: contextCandidates
                .filter((candidate) => !resourceHintNoise(candidate))
                .slice(0, 8),
              datasetKeys: Object.keys(data)
                .filter((key) => !key.startsWith("__"))
                .slice(0, 24),
            });
          }
        }
      }

      const next = await clickNextCalendarWindow(page);
      if (!next.advanced) break;
      if (next.fingerprint && pageFingerprints.has(next.fingerprint)) break;
      if (next.fingerprint) pageFingerprints.add(next.fingerprint);
    }
  } finally {
    page.off("response", onResponse);
  }

  const detailBlocks = [];
  let detailFetchFailures = 0;

  for (const href of [...detailLinks].slice(0, 50)) {
    try {
      const response = await context.request.get(href, {
        timeout: 8_000,
        failOnStatusCode: false,
      });

      if (!response.ok()) {
        detailFetchFailures += 1;
        continue;
      }

      const parsed = parseReservationDetail(await response.text(), href);
      if (parsed) detailBlocks.push(parsed);
    } catch {
      detailFetchFailures += 1;
    }
  }

  const allBlocks = uniqueBlocks([
    ...networkBlocks,
    ...domBlocks,
    ...detailBlocks,
  ]);

  for (const block of allBlocks) {
    if (block.resourceLabel) {
      discoveredResourceLabels.add(block.resourceLabel);
    }
  }

  const catalog = resourceCatalog(discoveredResourceLabels);

  const diagnostic = {
    jsonBlocks: networkBlocks.length,
    domBlocks: domBlocks.length,
    detailBlocks: detailBlocks.length,
    reservationLinks: detailLinks.size,
    schemaPaths: [...schemaPaths].slice(0, 40),
    networkPaths: [...networkPaths].slice(0, 40),
    detailFetchFailures,
    unresolvedDomSamples,
    resourceCatalog: catalog.slice(0, 250),
  };

  // Account-level mapping is only safe if every occupied/block record can be
  // tied to a concrete ResNexus room/unit.
  if (allBlocks.some((block) => !block.resourceLabel)) {
    throw new UnsafeExtractionError(
      "One or more ResNexus reservation records did not expose a room/unit identity. Existing Find A Place availability was preserved until the live-account extractor can prove every reservation-to-cabin mapping.",
      diagnostic,
    );
  }

  const blocks = allBlocks
    .filter((block) => blockInWindow(block, windowStart, windowEnd))
    .map((block) => {
      const key = resourceKey(block.resourceLabel);

      if (!key) {
        throw new UnsafeExtractionError(
          "A ResNexus reservation had an invalid room/unit identity.",
          diagnostic,
        );
      }

      return {
        key: block.key,
        uid: block.uid,
        start: block.start,
        end: block.end,
        resource_key: key,
        resource_label: clean(block.resourceLabel),
        metadata: {
          provider: "RESNEXUS",
          source: "persistent_browser",
          resource: clean(block.resourceLabel),
          extractor: block.source,
        },
      };
    });

  if (!catalog.length && blocks.length) {
    throw new UnsafeExtractionError(
      "ResNexus reservations were found, but no stable room/unit catalog could be created.",
      diagnostic,
    );
  }

  if (!blocks.length) {
    const body = clean(
      await page.locator("body").innerText().catch(() => ""),
    ).toLowerCase();

    const explicitlyEmpty =
      body.includes("no reservations") ||
      body.includes("no bookings") ||
      body.includes("no results");

    if (!catalog.length && !explicitlyEmpty) {
      throw new UnsafeExtractionError(
        "The ResNexus calendar loaded, but the worker could not prove either a room/unit catalog or a safely empty calendar. The first live account needs extractor calibration.",
        diagnostic,
      );
    }
  }

  return {
    windowStart,
    windowEnd,
    blocks,
    resources: catalog,
    diagnostic,
  };
}
