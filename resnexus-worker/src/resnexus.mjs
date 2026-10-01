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

function canonicalResourceLabel(value) {
  let label = clean(value)
    .replace(/^(?:rv\s*)?\d{1,3}\)\s*/i, "")
    .trim();

  // ResNexus exposes the same physical inventory under several display
  // aliases across its calendar/search/detail surfaces. Collapse only the
  // account-specific aliases we have proven are the same unit inventory so
  // one FAP mapping catches every reservation for that physical unit.
  if (/^lil['’]?\s+rustic\s+with\s+hot\s+tub\d+$/i.test(label)) {
    label = label.replace(/\d+$/, "").trim();
  }

  if (/^rv\s+sites\s+\d+\s*-\s*\d+$/i.test(label)) {
    label = label.replace(/^rv\s+/i, "").trim();
  }

  if (/^white\s+tail$/i.test(label)) {
    return "White Tail Cabin at Crystal Ridge";
  }

  if (
    /^white\s+tail\s+cabin\s+at\s+crystal\s+ridge\s+(?:with|without)\s+bunkroom$/i.test(
      label,
    )
  ) {
    return label
      .replace(/\s+(?:with|without)\s+bunkroom$/i, "")
      .trim();
  }

  return label;
}

function bestKnownResource(value, labels) {
  const haystack = normalizedResource(value);
  if (!haystack || !labels?.length) return null;

  const matches = [];

  for (const rawLabel of labels) {
    const cleaned = clean(rawLabel);
    const canonical = canonicalResourceLabel(cleaned);

    if (
      !canonical ||
      resourceHintNoise(cleaned) ||
      resourceHintNoise(canonical)
    ) {
      continue;
    }

    const rawNormalized = normalizedResource(cleaned);
    const canonicalNormalized = normalizedResource(canonical);

    for (const normalized of new Set([
      rawNormalized,
      canonicalNormalized,
    ])) {
      if (!normalized || normalized.length < 3) continue;

      if (
        haystack === normalized ||
        haystack.includes(` ${normalized} `) ||
        haystack.startsWith(`${normalized} `) ||
        haystack.endsWith(` ${normalized}`)
      ) {
        matches.push({
          label: canonical,
          normalized,
        });
      }
    }
  }

  matches.sort(
    (left, right) => right.normalized.length - left.normalized.length,
  );

  return matches[0]?.label || null;
}

function stableHash(value, length = 48) {
  return createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, length);
}

function resourceKey(label) {
  const canonical = canonicalResourceLabel(label);
  const normalized = normalizedResource(canonical);
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

  let match = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) {
    return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (match) {
    return validDate(Number(match[3]), Number(match[1]), Number(match[2]));
  }

  match = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b/);
  if (match) {
    return validDate(
      2000 + Number(match[3]),
      Number(match[1]),
      Number(match[2]),
    );
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

function extractDateTokens(value) {
  const raw = String(value ?? "");
  const found = [];

  const collect = (regex) => {
    for (const match of raw.matchAll(regex)) {
      const date = isoDate(match[0]);
      if (date) found.push({ index: match.index ?? 0, date });
    }
  };

  collect(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g);
  collect(/\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b/g);
  collect(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2}\b/g);
  collect(
    /\b(?:January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept?|October|Oct|November|Nov|December|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}\b/gi,
  );

  // ResNexus sometimes renders ranges like "10/3 - 10/6/2026".
  for (const match of raw.matchAll(
    /\b(\d{1,2})[/-](\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/gi,
  )) {
    const first = validDate(
      Number(match[5]),
      Number(match[1]),
      Number(match[2]),
    );
    const second = validDate(
      Number(match[5]),
      Number(match[3]),
      Number(match[4]),
    );

    if (first) found.push({ index: match.index ?? 0, date: first });
    if (second) {
      found.push({
        index: (match.index ?? 0) + match[0].length - 1,
        date: second,
      });
    }
  }

  found.sort((left, right) => left.index - right.index);

  const seen = new Set();
  const output = [];

  for (const item of found) {
    if (seen.has(item.date)) continue;
    seen.add(item.date);
    output.push(item.date);
  }

  return output;
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
      `(?:^|\\n)[ \\t]*${label}[ \\t]*(?:date)?[ \\t]*[:#-]?[ \\t]*(?:\\n[ \\t]*)?([^\\n]{1,180})`,
      "i",
    );
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }

  return null;
}

function recordIdFromUrl(href) {
  try {
    const parsed = new URL(href, CALENDAR_URL);
    for (const [key, rawValue] of parsed.searchParams.entries()) {
      if (
        /^(id|reservationid|reservation_id|bookingid|booking_id|confirmationnumber|confirmation_number)$/i.test(
          key,
        )
      ) {
        const value = clean(rawValue);
        if (value) return value.slice(0, 240);
      }
    }
  } catch {
    // Ignore malformed record URLs.
  }

  return null;
}

async function readRenderedDetailResource(
  context,
  href,
  knownResources,
) {
  const detailPage = await context.newPage();

  try {
    await detailPage.goto(href, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await detailPage.waitForTimeout(900);

    if (await isLoginPage(detailPage)) return null;

    const challenge = await detectChallenge(detailPage);
    if (challenge) return null;

    const bodyText = await detailPage
      .locator("body")
      .innerText()
      .catch(() => "");

    const selectedOptions = await detailPage
      .locator("select option:checked, select option[selected]")
      .evaluateAll((options) =>
        options
          .map((option) =>
            String(option.textContent || "")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter(Boolean),
      )
      .catch(() => []);

    const resourceHints = await resourceHintsFromPage(detailPage).catch(
      () => [],
    );

    const renderedText = [
      bodyText,
      ...selectedOptions,
      ...resourceHints,
    ].join("\n");

    const matched = bestKnownResource(
      renderedText,
      knownResources,
    );

    return matched ? canonicalResourceLabel(matched) : null;
  } finally {
    await detailPage.close().catch(() => null);
  }
}

function parseReservationDetail(html, href, knownResources = []) {
  const text = stripHtml(html);

  if (
    /\bstatus\s*[:#-]?\s*(?:cancelled|canceled|void|deleted)\b/i.test(text)
  ) {
    return null;
  }

  let start = isoDate(
    labelledValue(text, [
      "check[ -]?in",
      "arrival",
      "arrive",
      "start",
      "begin",
      "from",
    ]),
  );
  let end = isoDate(
    labelledValue(text, [
      "check[ -]?out",
      "departure",
      "depart",
      "end",
      "through",
      "to",
    ]),
  );

  if (!start || !end) {
    const rangeText = labelledValue(text, [
      "date range",
      "stay dates?",
      "reservation dates?",
      "booking dates?",
      "blocked dates?",
    ]);
    const rangeDates = extractDateTokens(rangeText);

    if (rangeDates.length === 2) {
      start ||= rangeDates[0];
      end ||= rangeDates[1];
    }
  }

  if (!start || !end) {
    const dates = extractDateTokens(text);
    if (dates.length === 2) {
      start ||= dates[0];
      end ||= dates[1];
    }
  }

  if (!start || !end || end <= start) return null;

  let resourceLabel =
    labelledValue(text, [
      "room(?:\\s*\\/\\s*unit)?",
      "rooms?",
      "room name",
      "units?",
      "unit name",
      "sites?",
      "site name",
      "resource",
      "accommodation",
      "rental",
    ]) || null;

  if (
    resourceLabel &&
    knownResources.length &&
    !bestKnownResource(resourceLabel, knownResources)
  ) {
    resourceLabel = null;
  }

  resourceLabel =
    bestKnownResource(resourceLabel || text, knownResources) ||
    resourceLabel;

  if (!resourceLabel) return null;

  const externalId =
    recordIdFromUrl(href) ||
    labelledValue(text, [
      "confirmation(?:\\s*(?:number|no\\.?|#|id))?",
      "reservation(?:\\s*(?:number|no\\.?|#|id))?",
      "booking(?:\\s*(?:number|no\\.?|#|id))?",
      "block(?:\\s*(?:number|no\\.?|#|id))?",
    ]);

  const stableId =
    externalId ||
    stableHash(
      [
        normalizedResource(resourceLabel),
        start,
        end,
        stripHtml(text).slice(0, 1000),
      ].join("|"),
    );

  return {
    key: `RESNEXUS:${stableId}`,
    uid: stableId,
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
  "sitename",
  "site_name",
  "resourcename",
  "resource_name",
  "unittypename",
  "unit_type_name",
  "room",
  "unit",
  "site",
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
  const seenKeys = new Set();
  const seenOccupancy = new Set();
  const output = [];

  for (const block of blocks) {
    const key = [
      block.key,
      block.start,
      block.end,
      normalizedResource(block.resourceLabel),
    ].join("|");

    const occupancy = [
      block.start,
      block.end,
      normalizedResource(block.resourceLabel),
    ].join("|");

    if (seenKeys.has(key) || seenOccupancy.has(occupancy)) continue;

    seenKeys.add(key);
    seenOccupancy.add(occupancy);
    output.push(block);
  }

  return output;
}

function recordSpecificReservationHref(href) {
  try {
    const parsed = new URL(href, CALENDAR_URL);
    const pathname = parsed.pathname.toLowerCase();

    if (!parsed.hostname.toLowerCase().endsWith("resnexus.com")) {
      return false;
    }

    if (
      pathname.includes("/guests/") ||
      pathname.includes("/houseaccounts/") ||
      pathname.includes("/reservations/book/")
    ) {
      return false;
    }

    const hasRecordId = [...parsed.searchParams.entries()].some(
      ([key, value]) =>
        /^(id|reservationid|reservation_id|bookingid|booking_id|confirmationnumber|confirmation_number)$/i.test(
          key,
        ) && clean(value),
    );

    if (
      hasRecordId &&
      (pathname.includes("/reservations/") ||
        pathname.includes("/blocked/") ||
        pathname.includes("/booking/"))
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function reservationListHref(href) {
  try {
    const parsed = new URL(href, CALENDAR_URL);
    if (!parsed.hostname.toLowerCase().endsWith("resnexus.com")) {
      return false;
    }

    const pathname = parsed.pathname.toLowerCase();

    return (
      pathname.endsWith("/manage/reservations/search.aspx") ||
      pathname.endsWith("/manage/reservations/reservations.aspx") ||
      pathname.endsWith("/manage/reservations/reservationsv6.aspx") ||
      pathname.endsWith("/v6/backoffice/reservations/search/index")
    );
  } catch {
    return false;
  }
}

function navigationKey(href) {
  try {
    const parsed = new URL(href, CALENDAR_URL);
    return parsed.pathname.toLowerCase();
  } catch {
    return String(href);
  }
}

async function collectReservationHrefs(page) {
  return page
    .locator(
      'a[href*="reservation" i], a[href*="booking" i], a[href*="blocked" i], a[href*="block" i]',
    )
    .evaluateAll((anchors) => [
      ...new Set(
        anchors
          .map((anchor) => anchor.href || anchor.getAttribute("href"))
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

        for (const [key, value] of Object.entries(element.dataset || {})) {
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
    "all",
    "all rooms",
    "all unit types",
    "any time",
    "cabin",
    "cabins",
    "cancellations",
    "current / future stays",
    "current/future stays",
    "gift certificates",
    "lil rustic & rv sites",
    "past stays",
    "quotes / waiting list",
    "quotes/waiting list",
    "rate + taxes & fees",
    "retail",
    "rv site [short-term]",
    "rv sites",
    "staying between...",
    "staying on...",
    "stays",
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
  if (normalized.startsWith("access type:")) return true;
  if (normalized.startsWith("site amps:")) return true;
  if (normalized.startsWith("site length (ft):")) return true;
  if (/^show\s+\d+\s+days?$/.test(normalized)) return true;

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
      '[data-room-name], [data-unit-name], [data-resource-name], [data-site-name], select option, [class*="room" i], [class*="unit" i], [class*="site" i], [class*="resource" i]',
    )
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const dataset = element.dataset || {};
          return (
            dataset.roomName ||
            dataset.unitName ||
            dataset.resourceName ||
            dataset.siteName ||
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
  ];

  for (const selector of selectors) {
    const candidate = page.locator(selector).first();

    if (await candidate.isVisible().catch(() => false)) {
      const before = stableHash(
        `${page.url()}|${await page
          .locator("body")
          .innerText()
          .catch(() => "")}`,
      );

      await candidate.click().catch(() => null);
      await page.waitForLoadState("domcontentloaded").catch(() => null);
      await page.waitForTimeout(700);

      const after = stableHash(
        `${page.url()}|${await page
          .locator("body")
          .innerText()
          .catch(() => "")}`,
      );

      return {
        advanced: before !== after,
        fingerprint: after,
      };
    }
  }

  return { advanced: false, fingerprint: null };
}

async function collectStructuredRows(page) {
  return page
    .locator(
      'table tr, [role="row"], [data-reservation-id], [data-booking-id], [data-confirmation-number], [class*="reservation-row" i], [class*="reservation-item" i], [class*="booking-row" i], [class*="booking-item" i]',
    )
    .evaluateAll((rows) =>
      rows.slice(0, 1500).map((row) => {
        const text = String(row.innerText || row.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

        const cellNodes = [
          ...row.querySelectorAll(
            ':scope > td, :scope > th, [role="cell"], [role="gridcell"], [role="rowheader"]',
          ),
        ];

        const cells = cellNodes
          .map((cell) =>
            String(cell.innerText || cell.textContent || "")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter((value) => value.length > 0);

        const table = row.closest("table");
        let headerNodes = table
          ? [...table.querySelectorAll("thead th")]
          : [];

        if (!headerNodes.length && table) {
          const firstRow = table.querySelector("tr");
          headerNodes = firstRow
            ? [...firstRow.querySelectorAll("th")]
            : [];
        }

        const headers = headerNodes
          .map((header) =>
            String(header.innerText || header.textContent || "")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter((value) => value.length > 0);

        const links = [
          ...new Set(
            [...row.querySelectorAll("a[href]")]
              .map(
                (anchor) =>
                  anchor.href || anchor.getAttribute("href") || "",
              )
              .filter(Boolean),
          ),
        ];

        const data = {};
        for (const node of [row, ...cellNodes]) {
          for (const [key, value] of Object.entries(node.dataset || {})) {
            if (!(key in data) && value != null) data[key] = value;
          }
        }

        const inputs = {};
        for (const input of row.querySelectorAll(
          "input[name], select[name]",
        )) {
          const name = input.getAttribute("name");
          if (!name || name in inputs) continue;
          inputs[name] = String(input.value ?? "").slice(0, 500);
        }

        return {
          text,
          cells,
          headers,
          links,
          data,
          inputs,
        };
      }),
    )
    .catch(() => []);
}

function structuredValue(row, patterns) {
  const limit = Math.min(row.headers.length, row.cells.length);

  for (let index = 0; index < limit; index += 1) {
    const header = clean(row.headers[index]).toLowerCase();

    if (patterns.some((pattern) => pattern.test(header))) {
      const value = clean(row.cells[index]);
      if (value) return value;
    }
  }

  const containers = [row.data || {}, row.inputs || {}];

  for (const container of containers) {
    for (const [key, value] of Object.entries(container)) {
      const normalized = String(key)
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .toLowerCase();

      if (patterns.some((pattern) => pattern.test(normalized))) {
        const cleaned = clean(value);
        if (cleaned) return cleaned;
      }
    }
  }

  return null;
}

function recordIdFromRow(row) {
  for (const href of row.links || []) {
    if (!recordSpecificReservationHref(href)) continue;
    const value = recordIdFromUrl(href);
    if (value) return value;
  }

  const value = structuredValue(row, [
    /^reservation(?: number| no| id| #)?$/,
    /^booking(?: number| no| id| #)?$/,
    /^confirmation(?: number| no| id| #)?$/,
    /^block(?: number| no| id| #)?$/,
  ]);

  return value ? clean(value).slice(0, 240) : null;
}

function parseReservationRow(row, knownResources) {
  const text = clean(row.text);
  if (!text || text.length < 3) return { block: null, candidate: false };

  if (/\b(cancelled|canceled|void|deleted)\b/i.test(text)) {
    return { block: null, candidate: false };
  }

  const recordLinks = (row.links || []).filter((href) =>
    recordSpecificReservationHref(href),
  );

  let resourceLabel = structuredValue(row, [
    /\b(room|unit|site|resource)\b/,
    /accommodation/,
    /rental/,
  ]);

  if (resourceLabel && resourceHintNoise(resourceLabel)) {
    resourceLabel = null;
  }

  if (knownResources.length) {
    resourceLabel =
      bestKnownResource(resourceLabel || "", knownResources) ||
      bestKnownResource(text, knownResources) ||
      null;
  } else {
    resourceLabel ||= null;
  }

  let start = isoDate(
    structuredValue(row, [
      /check\s*-?\s*in/,
      /arrival/,
      /^start(?: date)?$/,
      /^from$/,
    ]),
  );

  let end = isoDate(
    structuredValue(row, [
      /check\s*-?\s*out/,
      /departure/,
      /^end(?: date)?$/,
      /^through$/,
      /^to$/,
    ]),
  );

  if (!start || !end) {
    const rangeText = structuredValue(row, [
      /^stay$/,
      /stay\s*dates?/,
      /^dates?$/,
      /reservation\s*dates?/,
      /booking\s*dates?/,
    ]);

    const rangeDates = extractDateTokens(rangeText);
    if (rangeDates.length === 2) {
      start ||= rangeDates[0];
      end ||= rangeDates[1];
    }
  }

  if (!start) {
    start = isoDate(
      labelledValue(text, [
        "check[ -]?in",
        "arrival",
        "start",
        "from",
      ]),
    );
  }

  if (!end) {
    end = isoDate(
      labelledValue(text, [
        "check[ -]?out",
        "departure",
        "end",
        "through",
        "to",
      ]),
    );
  }

  const rowDates = extractDateTokens(text);
  const candidate =
    recordLinks.length > 0 ||
    Boolean(
      resourceLabel &&
        (start || end || rowDates.length >= 2),
    );

  if (!candidate) return { block: null, candidate: false };

  if ((!start || !end) && rowDates.length === 2) {
    start ||= rowDates[0];
    end ||= rowDates[1];
  }

  const externalId = recordIdFromRow(row);

  if (!resourceLabel || !start || !end || end <= start) {
    return {
      block: null,
      candidate: true,
      unresolved: {
        hasResource: Boolean(resourceLabel),
        hasStart: Boolean(start),
        hasEnd: Boolean(end),
        dateTokenCount: rowDates.length,
        hasRecordLink: recordLinks.length > 0,
        headerCount: row.headers?.length || 0,
        cellCount: row.cells?.length || 0,
      },
      pending: {
        externalId,
        start,
        end,
        resourceLabel,
        recordLinks,
        fingerprint: stableHash(text.slice(0, 1400)),
      },
      recordLinks,
    };
  }

  const stableId =
    externalId ||
    stableHash(
      [
        normalizedResource(resourceLabel),
        start,
        end,
        text.slice(0, 1200),
      ].join("|"),
    );

  return {
    candidate: true,
    recordLinks,
    block: {
      key: `RESNEXUS:${stableId}`,
      uid: stableId,
      start,
      end,
      resourceLabel,
      source: "reservation_list",
    },
  };
}

async function applyReservationSearchWindow(
  page,
  windowStart,
  windowEnd,
) {
  const startSelectors = [
    'input[name*="checkin" i]',
    'input[id*="checkin" i]',
    'input[name*="arrival" i]',
    'input[id*="arrival" i]',
    'input[name*="startdate" i]',
    'input[id*="startdate" i]',
    'input[name*="fromdate" i]',
    'input[id*="fromdate" i]',
  ];

  const endSelectors = [
    'input[name*="checkout" i]',
    'input[id*="checkout" i]',
    'input[name*="departure" i]',
    'input[id*="departure" i]',
    'input[name*="enddate" i]',
    'input[id*="enddate" i]',
    'input[name*="todate" i]',
    'input[id*="todate" i]',
  ];

  let startInput = null;
  let endInput = null;

  for (const selector of startSelectors) {
    const candidate = page.locator(selector).first();
    if (await candidate.isVisible().catch(() => false)) {
      startInput = candidate;
      break;
    }
  }

  for (const selector of endSelectors) {
    const candidate = page.locator(selector).first();
    if (await candidate.isVisible().catch(() => false)) {
      endInput = candidate;
      break;
    }
  }

  if (!startInput || !endInput) return false;

  const display = (value) => {
    const [year, month, day] = value.split("-");
    return `${month}/${day}/${year}`;
  };

  await startInput.fill(display(windowStart));
  await endInput.fill(display(windowEnd));

  const form = startInput.locator("xpath=ancestor::form[1]");
  const submit = form
    .locator(
      'button[type="submit"], input[type="submit"], button:has-text("Search"), button:has-text("Apply"), button:has-text("Filter")',
    )
    .first();

  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
  } else {
    await endInput.press("Enter");
  }

  await page.waitForLoadState("domcontentloaded").catch(() => null);
  await page.waitForTimeout(700);
  return true;
}

async function clickNextResultPage(page) {
  const selectors = [
    'a[rel="next"]',
    '[aria-label*="next page" i]',
    '[title*="next page" i]',
    '.k-pager-wrap a[aria-label*="next" i]',
    '.k-pager-wrap a[title*="next" i]',
    '.pagination a[aria-label*="next" i]',
    '.pagination a[title*="next" i]',
    '.pager a[aria-label*="next" i]',
    '.pager a[title*="next" i]',
  ];

  for (const selector of selectors) {
    const candidate = page.locator(selector).first();

    if (!(await candidate.isVisible().catch(() => false))) continue;

    const disabled =
      (await candidate.getAttribute("aria-disabled").catch(() => null)) ===
        "true" ||
      ((await candidate.getAttribute("class").catch(() => "")) || "")
        .toLowerCase()
        .includes("disabled");

    if (disabled) return { advanced: false, exhausted: true };

    const before = stableHash(
      `${page.url()}|${await page
        .locator("body")
        .innerText()
        .catch(() => "")}`,
    );

    await candidate.click().catch(() => null);
    await page.waitForLoadState("domcontentloaded").catch(() => null);
    await page.waitForTimeout(700);

    const after = stableHash(
      `${page.url()}|${await page
        .locator("body")
        .innerText()
        .catch(() => "")}`,
    );

    return {
      advanced: before !== after,
      exhausted: before === after,
    };
  }

  return { advanced: false, exhausted: true };
}

async function scanReservationListPage({
  context,
  href,
  knownResources,
  discoveredResourceLabels,
  windowStart,
  windowEnd,
  maxPages,
  onResponse,
}) {
  const scanPage = await context.newPage();
  const blocks = [];
  const recordLinks = new Set();
  const pendingRows = [];
  const unresolved = [];
  const fingerprints = new Set();
  let candidateRows = 0;
  let rowsSeen = 0;
  let pagesScanned = 0;
  let explicitEmpty = false;
  let searchWindowApplied = false;
  let paginationExhausted = true;

  scanPage.on("response", onResponse);

  try {
    await scanPage.goto(href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await scanPage.waitForTimeout(800);

    if (await isLoginPage(scanPage)) {
      throw new NeedsAttentionError(
        "LOGIN_REQUIRED",
        "ResNexus returned to the login page while reading reservations.",
      );
    }

    const challenge = await detectChallenge(scanPage);
    if (challenge) {
      throw new NeedsAttentionError(challenge.code, challenge.message);
    }

    searchWindowApplied = await applyReservationSearchWindow(
      scanPage,
      windowStart,
      windowEnd,
    ).catch(() => false);

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      pagesScanned += 1;

      for (const label of await resourceHintsFromPage(scanPage)) {
        discoveredResourceLabels.add(label);
      }

      const labels = [
        ...new Set([
          ...knownResources,
          ...discoveredResourceLabels,
        ]),
      ];

      const rows = await collectStructuredRows(scanPage);
      rowsSeen += rows.length;

      for (const row of rows) {
        const parsed = parseReservationRow(row, labels);

        for (const link of parsed.recordLinks || []) {
          recordLinks.add(link);
        }

        if (!parsed.candidate) continue;
        candidateRows += 1;

        if (parsed.block) {
          blocks.push(parsed.block);
        } else {
          if (parsed.pending) pendingRows.push(parsed.pending);
          if (parsed.unresolved && unresolved.length < 20) {
            unresolved.push(parsed.unresolved);
          }
        }
      }

      for (const link of await collectReservationHrefs(scanPage)) {
        if (recordSpecificReservationHref(link)) {
          recordLinks.add(link);
        }
      }

      const body = clean(
        await scanPage.locator("body").innerText().catch(() => ""),
      ).toLowerCase();

      if (
        body.includes("no reservations") ||
        body.includes("no bookings") ||
        body.includes("no results") ||
        body.includes("0 results")
      ) {
        explicitEmpty = true;
      }

      const fingerprint = stableHash(
        `${scanPage.url()}|${body.slice(0, 12000)}`,
      );
      if (fingerprints.has(fingerprint)) {
        paginationExhausted = true;
        break;
      }
      fingerprints.add(fingerprint);

      const next = await clickNextResultPage(scanPage);
      paginationExhausted = next.exhausted;

      if (!next.advanced) break;

      if (pageIndex === maxPages - 1) {
        paginationExhausted = false;
      }
    }
  } finally {
    scanPage.off("response", onResponse);
    await scanPage.close().catch(() => null);
  }

  return {
    blocks,
    recordLinks: [...recordLinks],
    pendingRows,
    unresolved,
    candidateRows,
    rowsSeen,
    pagesScanned,
    explicitEmpty,
    searchWindowApplied,
    paginationExhausted,
  };
}

function blockInWindow(block, windowStart, windowEnd) {
  return block.end > windowStart && block.start < windowEnd;
}

function resourceCatalog(labels) {
  const byKey = new Map();

  for (const rawLabel of labels) {
    const label = canonicalResourceLabel(rawLabel);
    if (!label || resourceHintNoise(label)) continue;

    const key = resourceKey(label);
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing || label.length < existing.label.length) {
      byKey.set(key, { key, label });
    }
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
        !/(calendar|reservation|availability|grid|booking|block)/i.test(url)
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
      // Network extraction is supplemental. DOM/list validation below remains
      // the fail-closed source of truth.
    }
  };

  const discoveredResourceLabels = new Set();
  const recordLinks = new Set();
  const requiredRecordLinks = new Set();
  const reservationListUrls = new Map();
  const calendarDomBlocks = [];
  const ignoredCalendarRanges = [];
  const calendarFingerprints = new Set();
  let calendarPagesScanned = 0;

  page.on("response", onResponse);

  try {
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(1000);

    const challenge = await detectChallenge(page);
    if (challenge) {
      throw new NeedsAttentionError(challenge.code, challenge.message);
    }

    for (
      let pageIndex = 0;
      pageIndex < Math.max(1, maxCalendarPages);
      pageIndex += 1
    ) {
      calendarPagesScanned += 1;

      for (const label of await resourceHintsFromPage(page)) {
        discoveredResourceLabels.add(label);
      }

      for (const href of await collectReservationHrefs(page)) {
        if (recordSpecificReservationHref(href)) {
          recordLinks.add(href);
          requiredRecordLinks.add(href);
        }

        if (reservationListHref(href)) {
          const key = navigationKey(href);
          if (!reservationListUrls.has(key)) {
            reservationListUrls.set(key, href);
          }
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

        if (!start || !end || end <= start) continue;

        const explicitCandidates = [
          data.roomName,
          data.unitName,
          data.resourceName,
          data.siteName,
          data.room,
          data.unit,
          data.resource,
          data.site,
          ...(Array.isArray(data.__explicitResourceCandidates)
            ? data.__explicitResourceCandidates
            : []),
          ...(Array.isArray(data.__contextResourceCandidates)
            ? data.__contextResourceCandidates
            : []),
        ]
          .map((value) => clean(value))
          .filter(
            (value) =>
              value &&
              !resourceHintNoise(value),
          );

        const resourceLabel =
          exactKnownResourceCandidate(
            explicitCandidates,
            discoveredResourceLabels,
          ) ||
          (discoveredResourceLabels.size
            ? null
            : explicitCandidates[0] || null);

        const externalId = clean(
          data.reservationId ||
            data.bookingId ||
            data.confirmationNumber ||
            data.id ||
            "",
        );

        if (!resourceLabel && !externalId) {
          if (ignoredCalendarRanges.length < 10) {
            ignoredCalendarRanges.push({
              start,
              end,
              datasetKeys: Object.keys(data)
                .filter((key) => !key.startsWith("__"))
                .slice(0, 24),
            });
          }
          continue;
        }

        if (!resourceLabel) {
          // A calendar element with an ID but no unit identity is not safe to
          // assign here. Its record/detail page or reservation list is scanned
          // below, where the unit can be proven.
          continue;
        }

        discoveredResourceLabels.add(resourceLabel);

        const stableId =
          externalId ||
          stableHash(
            [
              normalizedResource(resourceLabel),
              start,
              end,
              JSON.stringify(data).slice(0, 1500),
            ].join("|"),
          );

        calendarDomBlocks.push({
          key: `RESNEXUS:${stableId}`,
          uid: stableId,
          start,
          end,
          resourceLabel,
          source: "calendar_dom",
        });
      }

      const next = await clickNextCalendarWindow(page);
      if (!next.advanced) break;

      if (
        next.fingerprint &&
        calendarFingerprints.has(next.fingerprint)
      ) {
        break;
      }

      if (next.fingerprint) {
        calendarFingerprints.add(next.fingerprint);
      }
    }
  } finally {
    page.off("response", onResponse);
  }

  // Known ResNexus reservation-list surfaces observed in the authenticated
  // back office. Actual links discovered in the live account take priority.
  const fallbackListUrls = [
    new URL(
      "/resnexus/manage/reservations/reservationsv6.aspx",
      CALENDAR_URL,
    ).toString(),
    new URL(
      "/resnexus/manage/reservations/search.aspx",
      CALENDAR_URL,
    ).toString(),
    new URL(
      "/resnexus/v6/backoffice/reservations/search/Index",
      CALENDAR_URL,
    ).toString(),
  ];

  for (const href of fallbackListUrls) {
    const key = navigationKey(href);
    if (!reservationListUrls.has(key)) {
      reservationListUrls.set(key, href);
    }
  }

  const listBlocks = [];
  const pendingListRows = [];
  const listScans = [];
  const unresolvedListRows = [];
  const maxResultPages = Math.max(
    2,
    Math.min(20, Number(maxCalendarPages || 12)),
  );

  for (const href of [...reservationListUrls.values()].slice(0, 4)) {
    try {
      const scan = await scanReservationListPage({
        context,
        href,
        knownResources: [...discoveredResourceLabels],
        discoveredResourceLabels,
        windowStart,
        windowEnd,
        maxPages: maxResultPages,
        onResponse,
      });

      listBlocks.push(...scan.blocks);
      pendingListRows.push(...scan.pendingRows);

      for (const link of scan.recordLinks) {
        recordLinks.add(link);
      }

      for (const item of scan.unresolved) {
        if (unresolvedListRows.length < 30) {
          unresolvedListRows.push(item);
        }
      }

      listScans.push({
        pathname: new URL(href).pathname,
        candidateRows: scan.candidateRows,
        parsedBlocks: scan.blocks.length,
        unresolvedRows: scan.unresolved.length,
        rowsSeen: scan.rowsSeen,
        pagesScanned: scan.pagesScanned,
        explicitEmpty: scan.explicitEmpty,
        searchWindowApplied: scan.searchWindowApplied,
        paginationExhausted: scan.paginationExhausted,
      });
    } catch (error) {
      if (error instanceof NeedsAttentionError) throw error;

      listScans.push({
        pathname: (() => {
          try {
            return new URL(href).pathname;
          } catch {
            return "unknown";
          }
        })(),
        error: clean(
          error instanceof Error ? error.message : String(error),
        ).slice(0, 300),
      });
    }
  }

  const knownResources = [...discoveredResourceLabels];
  const detailBlocks = [];
  const bridgedListBlocks = [];
  const detailPatterns = new Set();
  const unparsedRecordDetails = [];
  const unresolvedRequiredDetails = [];
  const detailResourceByRecordId = new Map();
  const resolvedDetailRecordIds = new Set();
  const cancelledDetailRecordIds = new Set();
  let detailFetchFailures = 0;
  let requiredDetailFetchFailures = 0;
  let renderedDetailFallbacks = 0;
  let renderedDetailResolutions = 0;

  // Only fetch detail pages that are required by the visible calendar or by a
  // list row that still needs unit/date information. Fully parsed list rows do
  // not need a second browser request.
  const detailTargets = new Set(requiredRecordLinks);
  for (const pending of pendingListRows) {
    for (const href of pending.recordLinks || []) {
      if (recordSpecificReservationHref(href)) detailTargets.add(href);
    }
  }

  for (const href of [...detailTargets].slice(0, 300)) {
    if (!recordSpecificReservationHref(href)) continue;

    try {
      const parsedUrl = new URL(href);
      const recordId = recordIdFromUrl(href);
      detailPatterns.add(
        `${parsedUrl.pathname}?${[
          ...parsedUrl.searchParams.keys(),
        ]
          .sort()
          .join(",")}`,
      );

      const response = await context.request.get(href, {
        timeout: 10_000,
        failOnStatusCode: false,
      });

      if (!response.ok()) {
        detailFetchFailures += 1;
        if (requiredRecordLinks.has(href)) {
          requiredDetailFetchFailures += 1;
        }
        continue;
      }

      const html = await response.text();
      const text = stripHtml(html);
      const cancelled =
        /\bstatus\s*[:#-]?\s*(?:cancelled|canceled|void|deleted)\b/i.test(
          text,
        );

      if (cancelled) {
        if (recordId) cancelledDetailRecordIds.add(recordId);
        continue;
      }

      let detailResource = bestKnownResource(
        text,
        knownResources,
      );

      if (!detailResource && recordId) {
        renderedDetailFallbacks += 1;

        detailResource = await readRenderedDetailResource(
          context,
          href,
          knownResources,
        ).catch(() => null);

        if (detailResource) {
          renderedDetailResolutions += 1;
        }
      }

      if (detailResource) {
        detailResource = canonicalResourceLabel(detailResource);
      }

      if (recordId && detailResource) {
        detailResourceByRecordId.set(recordId, detailResource);
      }

      const parsed = parseReservationDetail(
        html,
        href,
        knownResources,
      );

      if (parsed) {
        detailBlocks.push(parsed);
        discoveredResourceLabels.add(parsed.resourceLabel);
        if (recordId) resolvedDetailRecordIds.add(recordId);
      } else {
        const signal = {
          pathname: parsedUrl.pathname,
          queryKeys: [...parsedUrl.searchParams.keys()]
            .sort()
            .slice(0, 20),
          dateTokenCount: extractDateTokens(text).length,
          hasResourceMatch: Boolean(detailResource),
          hasCheckInLabel:
            /check[ -]?in|arrival|start date/i.test(text),
          hasCheckOutLabel:
            /check[ -]?out|departure|end date/i.test(text),
        };

        if (unparsedRecordDetails.length < 20) {
          unparsedRecordDetails.push(signal);
        }

        // Do not mark a calendar-linked detail as unresolved yet when it gave
        // us a stable unit identity; its dates may be supplied by the matching
        // reservation-list row below.
        if (
          requiredRecordLinks.has(href) &&
          !detailResource &&
          unresolvedRequiredDetails.length < 20
        ) {
          unresolvedRequiredDetails.push(signal);
        }
      }
    } catch {
      detailFetchFailures += 1;
      if (requiredRecordLinks.has(href)) {
        requiredDetailFetchFailures += 1;
      }
    }
  }

  const remainingUnresolvedListRows = [];
  const conservativeAmbiguousBlocks = [];
  let ignoredOutOfWindowRows = 0;
  let ignoredNonDatedListRows = 0;
  let ambiguousCurrentRows = 0;

  // Build the same cleaned resource set that will later be shown for mapping.
  // If a current/future reservation has dates but ResNexus withholds its unit
  // identity on both the list and detail page, the safe temporary behavior is
  // to block that stay window on every mapped resource for this account rather
  // than fail the whole sync or risk a double booking.
  const conservativeResourceLabels = resourceCatalog(
    [...discoveredResourceLabels].filter(
      (label) => !resourceHintNoise(label),
    ),
  ).map((resource) => resource.label);

  for (const pending of pendingListRows) {
    const linkedIds = (pending.recordLinks || [])
      .map((href) => recordIdFromUrl(href))
      .filter(Boolean);

    const requiredByCalendar = (pending.recordLinks || []).some((href) =>
      requiredRecordLinks.has(href),
    );

    if (
      linkedIds.some(
        (recordId) =>
          resolvedDetailRecordIds.has(recordId) ||
          cancelledDetailRecordIds.has(recordId),
      )
    ) {
      continue;
    }

    if (
      pending.start &&
      pending.end &&
      pending.end > pending.start &&
      !blockInWindow(pending, windowStart, windowEnd) &&
      !requiredByCalendar
    ) {
      ignoredOutOfWindowRows += 1;
      continue;
    }

    if (
      (!pending.start || !pending.end || pending.end <= pending.start) &&
      !requiredByCalendar
    ) {
      ignoredNonDatedListRows += 1;
      continue;
    }

    let resourceLabel = pending.resourceLabel || null;
    let joinedRecordId = pending.externalId || null;

    for (const recordId of linkedIds) {
      if (!joinedRecordId) joinedRecordId = recordId;
      const fromDetail = detailResourceByRecordId.get(recordId);
      if (fromDetail) {
        resourceLabel = canonicalResourceLabel(fromDetail);
        joinedRecordId = recordId;
        break;
      }
    }

    if (resourceLabel) {
      resourceLabel = canonicalResourceLabel(resourceLabel);
    }

    if (
      resourceLabel &&
      pending.start &&
      pending.end &&
      pending.end > pending.start
    ) {
      const stableId =
        joinedRecordId ||
        stableHash(
          [
            normalizedResource(resourceLabel),
            pending.start,
            pending.end,
            pending.fingerprint,
          ].join("|"),
        );

      bridgedListBlocks.push({
        key: `RESNEXUS:${stableId}`,
        uid: stableId,
        start: pending.start,
        end: pending.end,
        resourceLabel,
        source: "reservation_list_detail_join",
      });
      discoveredResourceLabels.add(resourceLabel);
      continue;
    }

    // A calendar-linked occupancy record is authoritative and must still
    // resolve to one exact resource. Never fan those out.
    if (
      requiredByCalendar ||
      !pending.start ||
      !pending.end ||
      pending.end <= pending.start
    ) {
      if (remainingUnresolvedListRows.length < 30) {
        const unresolvedPaths = (pending.recordLinks || [])
          .map((href) => {
            try {
              return new URL(href).pathname;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .slice(0, 4);

        remainingUnresolvedListRows.push({
          hasResource: Boolean(resourceLabel),
          hasStart: Boolean(pending.start),
          hasEnd: Boolean(pending.end),
          start: pending.start || null,
          end: pending.end || null,
          hasRecordLink: linkedIds.length > 0,
          requiredByCalendar,
          recordPaths: unresolvedPaths,
        });
      }
      continue;
    }

    // Temporary ResNexus bridge safety fallback. This is intentionally
    // conservative: one ambiguous current reservation blocks its stay dates
    // on every mapped ResNexus resource. It can reduce availability for that
    // short window, but it cannot create a false opening/double-booking risk.
    if (conservativeResourceLabels.length) {
      ambiguousCurrentRows += 1;

      const recordSeed =
        joinedRecordId ||
        pending.fingerprint ||
        stableHash(
          `${pending.start}|${pending.end}|ambiguous`,
        );

      for (const label of conservativeResourceLabels) {
        const canonical = canonicalResourceLabel(label);
        if (!canonical || resourceHintNoise(canonical)) continue;

        const resourceSeed = stableHash(
          normalizedResource(canonical),
          16,
        );

        conservativeAmbiguousBlocks.push({
          key: `RESNEXUS:AMBIG:${recordSeed}:${resourceSeed}`,
          uid: `AMBIG:${recordSeed}`,
          start: pending.start,
          end: pending.end,
          resourceLabel: canonical,
          source: "ambiguous_reservation_safety_block",
        });
      }

      continue;
    }

    // If there is somehow no resource catalog to fan the safety block across,
    // retain the fail-closed behavior.
    if (remainingUnresolvedListRows.length < 30) {
      remainingUnresolvedListRows.push({
        hasResource: false,
        hasStart: true,
        hasEnd: true,
        start: pending.start,
        end: pending.end,
        hasRecordLink: linkedIds.length > 0,
        requiredByCalendar: false,
        reason: "no_resource_catalog_for_safety_fallback",
      });
    }
  }

  const safeNetworkBlocks = networkBlocks.filter(
    (block) => Boolean(block.resourceLabel),
  );

  const allBlocks = uniqueBlocks([
    ...safeNetworkBlocks,
    ...calendarDomBlocks,
    ...listBlocks,
    ...bridgedListBlocks,
    ...conservativeAmbiguousBlocks,
    ...detailBlocks,
  ]);

  for (const block of allBlocks) {
    if (block.resourceLabel) {
      discoveredResourceLabels.add(block.resourceLabel);
    }
  }

  const catalog = resourceCatalog(
    [...discoveredResourceLabels].filter(
      (label) => !resourceHintNoise(label),
    ),
  );

  const successfulListScans = listScans.filter(
    (scan) => !scan.error,
  );
  const listEvidence = successfulListScans.some((scan) => {
    const pathname = String(scan.pathname || "").toLowerCase();
    const directList =
      pathname.endsWith("/reservationsv6.aspx") ||
      pathname.endsWith("/reservations.aspx");

    return (
      scan.candidateRows > 0 ||
      scan.parsedBlocks > 0 ||
      bridgedListBlocks.length > 0 ||
      (scan.explicitEmpty &&
        (scan.searchWindowApplied || directList))
    );
  });
  const paginationIncomplete = successfulListScans.some(
    (scan) =>
      scan.candidateRows > 0 &&
      scan.paginationExhausted === false,
  );

  const diagnostic = {
    strategy: "reservation_list_detail_join_v2",
    calendarPagesScanned,
    calendarDomBlocks: calendarDomBlocks.length,
    ignoredCalendarRanges,
    reservationListScans: listScans,
    listBlocks: listBlocks.length,
    bridgedListBlocks: bridgedListBlocks.length,
    conservativeAmbiguousBlocks: conservativeAmbiguousBlocks.length,
    ambiguousCurrentRows,
    ignoredOutOfWindowRows,
    ignoredNonDatedListRows,
    unresolvedListRows: remainingUnresolvedListRows,
    rawUnresolvedListRows: unresolvedListRows,
    recordSpecificLinks: [...recordLinks].filter((href) =>
      recordSpecificReservationHref(href),
    ).length,
    detailBlocks: detailBlocks.length,
    detailFetchFailures,
    requiredDetailFetchFailures,
    renderedDetailFallbacks,
    renderedDetailResolutions,
    unparsedRecordDetails,
    unresolvedRequiredDetails,
    detailPatterns: [...detailPatterns].slice(0, 40),
    jsonBlocks: networkBlocks.length,
    jsonBlocksWithResource: safeNetworkBlocks.length,
    ignoredJsonDateObjects:
      networkBlocks.length - safeNetworkBlocks.length,
    schemaPaths: [...schemaPaths].slice(0, 40),
    networkPaths: [...networkPaths].slice(0, 40),
    resourceCatalog: catalog.slice(0, 250),
  };

  if (!catalog.length) {
    throw new UnsafeExtractionError(
      "The ResNexus account loaded, but no stable room/unit catalog could be proven.",
      diagnostic,
    );
  }

  if (remainingUnresolvedListRows.length) {
    throw new UnsafeExtractionError(
      "ResNexus reservation rows were found, but one or more could not be resolved after joining their stay dates to the linked reservation/block detail page. Existing Find A Place availability was preserved.",
      diagnostic,
    );
  }

  if (paginationIncomplete) {
    throw new UnsafeExtractionError(
      "ResNexus reservation results exceeded the safely scanned result pages. Existing Find A Place availability was preserved instead of applying a partial snapshot.",
      diagnostic,
    );
  }

  if (requiredDetailFetchFailures > 0) {
    throw new UnsafeExtractionError(
      "One or more calendar-linked ResNexus reservation/block detail pages could not be read. Existing Find A Place availability was preserved instead of applying a partial snapshot.",
      diagnostic,
    );
  }

  if (unresolvedRequiredDetails.length) {
    throw new UnsafeExtractionError(
      "One or more calendar-linked ResNexus reservation/block pages could not be safely mapped to a room/unit and stay dates. Existing Find A Place availability was preserved.",
      diagnostic,
    );
  }

  if (allBlocks.some((block) => !block.resourceLabel)) {
    throw new UnsafeExtractionError(
      "One or more ResNexus reservation records did not expose a room/unit identity. Existing Find A Place availability was preserved.",
      diagnostic,
    );
  }

  // A reservation list/search surface is our completeness check. Calendar DOM
  // and individual detail pages supplement it, but are not enough on their own
  // to prove that every active reservation was seen.
  if (!listEvidence) {
    throw new UnsafeExtractionError(
      "The ResNexus account and room list loaded, but the worker could not yet prove a complete reservation-list snapshot. Existing Find A Place availability was preserved.",
      diagnostic,
    );
  }

  const blocks = allBlocks
    .filter((block) =>
      blockInWindow(block, windowStart, windowEnd),
    )
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

  return {
    windowStart,
    windowEnd,
    blocks,
    resources: catalog,
    diagnostic,
  };
}

