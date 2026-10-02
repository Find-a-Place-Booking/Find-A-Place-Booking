const RESNEXUS_ORIGIN = "https://resnexus.com";
const MAX_NORMAL_STAY_DAYS = 62;

export class SnapshotVerificationError extends Error {
  constructor(message, diagnostic = {}) {
    super(message);
    this.name = "SnapshotVerificationError";
    this.diagnostic = diagnostic;
  }
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeResource(value) {
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

  if (/^lil['’]?\s+rustic\s+with\s+hot\s+tub\d+$/i.test(label)) {
    label = label.replace(/\d+$/, "").trim();
  }
  if (/^rv\s+sites\s+\d+\s*-\s*\d+$/i.test(label)) {
    label = label.replace(/^rv\s+/i, "").trim();
  }
  if (/^white\s+tail$/i.test(label)) {
    return "White Tail Cabin at Crystal Ridge";
  }
  if (/^white\s+tail\s+cabin\s+at\s+crystal\s+ridge\s+(?:with|without)\s+bunkroom$/i.test(label)) {
    return label.replace(/\s+(?:with|without)\s+bunkroom$/i, "").trim();
  }
  return label;
}

function resourceMatch(value, resources) {
  const hay = normalizeResource(value);
  if (!hay) return null;

  const matches = resources
    .map((resource) => ({
      ...resource,
      canonical: canonicalResourceLabel(resource.label),
      normalized: normalizeResource(canonicalResourceLabel(resource.label)),
    }))
    .filter((resource) => {
      if (!resource.normalized) return false;
      return hay === resource.normalized || hay.includes(resource.normalized);
    })
    .sort((a, b) => b.normalized.length - a.normalized.length);

  if (!matches.length) return null;
  if (
    matches.length > 1 &&
    matches[0].normalized.length === matches[1].normalized.length &&
    matches[0].key !== matches[1].key
  ) {
    return null;
  }
  return matches[0];
}

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function validYmd(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export function toIsoDate(raw) {
  const value = clean(raw).replace(/\u00a0/g, " ");
  let match = value.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) return validYmd(Number(match[1]), Number(match[2]), Number(match[3]));

  match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return validYmd(year, Number(match[1]), Number(match[2]));
  }

  match = value.match(/\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    return validYmd(Number(match[3]), month, Number(match[2]));
  }
  return null;
}

function dateRegex() {
  return /\b(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})\b/gi;
}

function extractDateTokens(text) {
  const output = [];
  const regex = dateRegex();
  let match;
  while ((match = regex.exec(String(text || "")))) {
    const date = toIsoDate(match[0]);
    if (!date) continue;
    output.push({ date, index: match.index, raw: match[0] });
  }
  return output;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const left = new Date(`${start}T00:00:00Z`).getTime();
  const right = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((right - left) / 86400000);
}

function reasonableRange(start, end, maxDays = MAX_NORMAL_STAY_DAYS) {
  if (!start || !end || end <= start) return false;
  const days = daysBetween(start, end);
  return days >= 1 && days <= maxDays;
}

function explicitLabelDate(text, startSide) {
  const label = startSide
    ? "(?:check\\s*-?\\s*in|arrival|arrive)"
    : "(?:check\\s*-?\\s*out|departure|depart)";
  const regex = new RegExp(
    `${label}\\s*(?:date)?\\s*[:#-]?\\s*([^\\n\\r]{0,120})`,
    "ig",
  );
  const source = String(text || "");
  let match;
  while ((match = regex.exec(source))) {
    const date = match?.[1] ? toIsoDate(match[1]) : null;
    if (date) return date;
  }
  return null;
}

function nightCount(text) {
  const raw = String(text || "");
  const direct = raw.match(/\b(\d{1,3})\s+nights?\b/i);
  if (direct) return Number(direct[1]);
  const labelled = raw.match(/(?:^|\n|\r)\s*(?:number\s+of\s+)?nights?\s*[:#-]?\s*(\d{1,3})\b/i);
  return labelled ? Number(labelled[1]) : null;
}

function rangeCandidates(text) {
  const tokens = extractDateTokens(text);
  const ranges = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];
    const between = String(text || "").slice(
      left.index + left.raw.length,
      right.index,
    );
    if (between.length > 90) continue;
    if (!/(?:-|–|—|\bto\b|\bthrough\b)/i.test(between)) continue;
    if (!reasonableRange(left.date, right.date)) continue;
    ranges.push({ start: left.date, end: right.date });
  }

  const unique = new Map();
  for (const range of ranges) unique.set(`${range.start}|${range.end}`, range);
  return [...unique.values()];
}

function pickDates({ bodyText, controls, expectedStart, expectedEnd }) {
  const startValues = [];
  const endValues = [];
  let nights = null;

  for (const control of controls) {
    const key = clean([
      control.name,
      control.id,
      control.label,
      control.aria,
      control.placeholder,
      control.parentText,
    ].join(" ")).toLowerCase();
    const valueText = clean([control.value, control.selectedText, control.parentText].join(" "));

    if (/check\s*-?\s*in|arrival|arrive/.test(key)) {
      const date = toIsoDate(valueText);
      if (date) startValues.push(date);
    }
    if (/check\s*-?\s*out|departure|depart/.test(key)) {
      const date = toIsoDate(valueText);
      if (date) endValues.push(date);
    }
    if (/\bnights?\b|length\s+of\s+stay/.test(key)) {
      const match = valueText.match(/\b(\d{1,3})\b/);
      if (match) nights = Number(match[1]);
    }
  }

  const labelledStart = explicitLabelDate(bodyText, true);
  const labelledEnd = explicitLabelDate(bodyText, false);
  if (labelledStart) startValues.push(labelledStart);
  if (labelledEnd) endValues.push(labelledEnd);
  nights ||= nightCount(bodyText);

  const uniqueStarts = [...new Set(startValues)];
  const uniqueEnds = [...new Set(endValues)];

  for (const start of uniqueStarts) {
    for (const end of uniqueEnds) {
      if (reasonableRange(start, end)) {
        return { start, end, confidence: "explicit_checkin_checkout" };
      }
    }
  }

  if (uniqueStarts.length === 1 && nights && nights >= 1 && nights <= MAX_NORMAL_STAY_DAYS) {
    const start = uniqueStarts[0];
    return { start, end: addDays(start, nights), confidence: "checkin_plus_nights" };
  }

  const ranges = rangeCandidates(bodyText);
  if (ranges.length === 1) {
    return { ...ranges[0], confidence: "unique_rendered_range" };
  }

  const exact = ranges.find(
    (range) => range.start === expectedStart && range.end === expectedEnd,
  );
  if (exact) return { ...exact, confidence: "expected_range_confirmed" };

  if (uniqueStarts.length === 1 && ranges.length) {
    const matching = ranges.filter((range) => range.start === uniqueStarts[0]);
    if (matching.length === 1) {
      return { ...matching[0], confidence: "checkin_plus_unique_range" };
    }
  }

  return null;
}

function recordIdFromBlock(block) {
  const uid = clean(block?.uid);
  const key = clean(block?.key);
  const ambiguous = uid.startsWith("AMBIG:") || key.includes(":AMBIG:");
  const raw = uid.startsWith("AMBIG:") ? uid.slice(6) : uid;
  const recordId = /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : null;
  return { recordId, ambiguous };
}

function candidateDetailUrls(recordId) {
  const id = encodeURIComponent(recordId);
  return [
    `${RESNEXUS_ORIGIN}/resnexus/manage/reservations/reservation/info.aspx?ID=${id}`,
    `${RESNEXUS_ORIGIN}/resnexus/manage/reservations/blocked/information.aspx?ID=${id}`,
    `${RESNEXUS_ORIGIN}/resnexus/v6/backoffice/reservations/reservation/info/Index?ID=${id}`,
  ];
}

async function inspectDetailPage(page, url, resources, expectedBlock) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  }).catch(() => null);
  if (!response || response.status() >= 400) return null;
  await page.waitForTimeout(250);

  const facts = await page.evaluate(() => {
    const bodyText = String(document.body?.innerText || "");
    const controls = [...document.querySelectorAll("input, select, textarea")]
      .slice(0, 500)
      .map((element) => {
        const labels = element.labels
          ? [...element.labels].map((label) => label.innerText || label.textContent || "")
          : [];
        const parent = element.closest("tr, td, .form-group, .row, .field, div");
        const selectedText = element instanceof HTMLSelectElement
          ? [...element.selectedOptions]
              .map((option) => option.textContent || "")
              .join(" ")
          : "";
        return {
          name: element.getAttribute("name") || "",
          id: element.id || "",
          label: labels.join(" "),
          aria: element.getAttribute("aria-label") || "",
          placeholder: element.getAttribute("placeholder") || "",
          value: "value" in element ? String(element.value || "") : "",
          selectedText,
          parentText: String(parent?.innerText || "").slice(0, 500),
        };
      });
    const selectedOptions = [...document.querySelectorAll("select option:checked, select option[selected]")]
      .map((option) => String(option.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return { bodyText, controls, selectedOptions };
  }).catch(() => null);

  if (!facts || !facts.bodyText) return null;
  const bodyLower = facts.bodyText.toLowerCase();
  if (/\blog\s*in\b|\bsign\s*in\b/.test(bodyLower) && /password/.test(bodyLower)) {
    return null;
  }

  if (/\b(cancelled|canceled|void|voided|deleted)\b/i.test(facts.bodyText)) {
    return { inactive: true, url };
  }

  let resource = null;
  for (const option of facts.selectedOptions) {
    resource = resourceMatch(option, resources);
    if (resource) break;
  }

  if (!resource) {
    for (const control of facts.controls) {
      const key = clean([
        control.name,
        control.id,
        control.label,
        control.aria,
        control.placeholder,
      ].join(" "));
      if (!/\b(room|unit|site|resource|accommodation|rental)\b/i.test(key)) continue;
      resource = resourceMatch(
        clean([control.selectedText, control.value, control.parentText].join(" ")),
        resources,
      );
      if (resource) break;
    }
  }

  if (!resource) {
    const bodyMatches = resources.filter((candidate) => {
      const normalized = normalizeResource(canonicalResourceLabel(candidate.label));
      return normalized && normalizeResource(facts.bodyText).includes(normalized);
    });
    if (bodyMatches.length === 1) resource = bodyMatches[0];
  }

  const dates = pickDates({
    bodyText: facts.bodyText,
    controls: facts.controls,
    expectedStart: expectedBlock?.start,
    expectedEnd: expectedBlock?.end,
  });

  const score = (resource ? 4 : 0) + (dates ? 4 : 0);
  return {
    inactive: false,
    resource,
    dates,
    url,
    score,
    dateTokenCount: extractDateTokens(facts.bodyText).length,
  };
}

async function resolveRecord(context, recordId, resources, expectedBlock) {
  const page = await context.newPage();
  try {
    let best = null;
    for (const url of candidateDetailUrls(recordId)) {
      const facts = await inspectDetailPage(page, url, resources, expectedBlock);
      if (!facts) continue;
      if (facts.inactive) return facts;
      if (!best || facts.score > best.score) best = facts;
      if (facts.resource && facts.dates) return facts;
    }
    return best;
  } finally {
    await page.close().catch(() => null);
  }
}

function overlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

export async function verifyResNexusSnapshot({ context, snapshot }) {
  if (!snapshot || !Array.isArray(snapshot.blocks) || !Array.isArray(snapshot.resources)) {
    throw new SnapshotVerificationError(
      "ResNexus verification received an invalid account snapshot.",
      { stage: "snapshot_verifier" },
    );
  }

  const resources = snapshot.resources
    .filter((resource) => resource && typeof resource.key === "string" && typeof resource.label === "string")
    .map((resource) => ({ key: clean(resource.key), label: canonicalResourceLabel(resource.label) }));
  const resourceByKey = new Map(resources.map((resource) => [resource.key, resource]));
  const cache = new Map();
  const output = [];
  const failures = [];
  const corrections = [];
  const inactiveRecords = [];
  const emittedAmbiguous = new Set();

  for (const block of snapshot.blocks) {
    const extractor = clean(block?.metadata?.extractor);
    const { recordId, ambiguous } = recordIdFromBlock(block);
    const mustVerify =
      ambiguous ||
      extractor === "reservation_list_detail_join" ||
      extractor === "ambiguous_reservation_safety_block" ||
      (recordId && daysBetween(block.start, block.end) > MAX_NORMAL_STAY_DAYS);

    if (!mustVerify) {
      output.push(block);
      continue;
    }

    if (!recordId) {
      failures.push({
        uid: clean(block?.uid).slice(0, 80),
        reason: "record_id_unavailable",
        start: block.start,
        end: block.end,
      });
      continue;
    }

    let facts = cache.get(recordId);
    if (facts === undefined) {
      facts = await resolveRecord(context, recordId, resources, block).catch(() => null);
      cache.set(recordId, facts);
    }

    if (facts?.inactive) {
      inactiveRecords.push(recordId);
      continue;
    }

    if (!facts?.resource || !facts?.dates) {
      failures.push({
        recordId,
        reason: !facts?.resource ? "resource_not_proven" : "stay_dates_not_proven",
        originalResource: clean(block?.resource_label || block?.metadata?.resource).slice(0, 120),
        start: block.start,
        end: block.end,
        detailDateTokens: facts?.dateTokenCount ?? null,
      });
      continue;
    }

    if (!reasonableRange(facts.dates.start, facts.dates.end)) {
      failures.push({
        recordId,
        reason: "verified_range_implausible",
        start: facts.dates.start,
        end: facts.dates.end,
      });
      continue;
    }

    if (ambiguous || extractor === "ambiguous_reservation_safety_block") {
      if (emittedAmbiguous.has(recordId)) continue;
      emittedAmbiguous.add(recordId);
    }

    const resource = resourceByKey.get(facts.resource.key) || facts.resource;
    const changed =
      resource.key !== block.resource_key ||
      facts.dates.start !== block.start ||
      facts.dates.end !== block.end;

    // Resolved ambiguous records must always be carried into diagnostics,
    // even when the first fan-out copy already happens to match the true
    // resource and dates. Recovery uses this entry to collapse all raw
    // ambiguous copies down to one verified reservation.
    if (
      changed ||
      ambiguous ||
      extractor === "ambiguous_reservation_safety_block"
    ) {
      corrections.push({
        recordId,
        fromResource: block.resource_label,
        toResource: resource.label,
        fromStart: block.start,
        fromEnd: block.end,
        toStart: facts.dates.start,
        toEnd: facts.dates.end,
        confidence: facts.dates.confidence,
      });
    }

    output.push({
      ...block,
      key: `RESNEXUS:${recordId}`,
      uid: recordId,
      start: facts.dates.start,
      end: facts.dates.end,
      resource_key: resource.key,
      resource_label: resource.label,
      metadata: {
        ...(block.metadata || {}),
        resource: resource.label,
        extractor: "verified_reservation_detail",
        verification: facts.dates.confidence,
      },
    });
  }

  const unique = new Map();
  for (const block of output) {
    const identity = [block.uid, block.resource_key, block.start, block.end].join("|");
    unique.set(identity, block);
  }
  const verifiedBlocks = [...unique.values()];

  const byResource = new Map();
  for (const block of verifiedBlocks) {
    const list = byResource.get(block.resource_key) || [];
    list.push(block);
    byResource.set(block.resource_key, list);
  }

  const overlaps = [];
  for (const [resourceKey, blocks] of byResource) {
    const sorted = blocks.slice().sort((a, b) => a.start.localeCompare(b.start));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous.uid !== current.uid && overlap(previous, current)) {
        overlaps.push({
          resourceKey,
          first: { uid: previous.uid, start: previous.start, end: previous.end },
          second: { uid: current.uid, start: current.start, end: current.end },
        });
      }
    }
  }

  const diagnostic = {
    ...(snapshot.diagnostic || {}),
    verifier: {
      version: "detail-proof-v1",
      inputBlocks: snapshot.blocks.length,
      outputBlocks: verifiedBlocks.length,
      recordsChecked: cache.size,
      correctedBlocks: corrections.slice(0, 50),
      inactiveRecords: [...new Set(inactiveRecords)].slice(0, 50),
      failures: failures.slice(0, 50),
      overlaps: overlaps.slice(0, 30),
    },
  };

  if (failures.length) {
    throw new SnapshotVerificationError(
      "ResNexus returned reservation rows whose exact cabin or stay dates could not be proven from the reservation detail page. Existing Find A Place availability was preserved instead of guessing.",
      diagnostic,
    );
  }

  if (overlaps.length) {
    throw new SnapshotVerificationError(
      "ResNexus produced overlapping reservations for the same physical room/site after detail verification. Existing Find A Place availability was preserved for review.",
      diagnostic,
    );
  }

  return {
    ...snapshot,
    blocks: verifiedBlocks,
    diagnostic,
  };
}
