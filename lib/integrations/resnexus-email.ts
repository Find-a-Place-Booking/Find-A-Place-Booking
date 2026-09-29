import { createHmac, timingSafeEqual } from "node:crypto";

type ReceivedEmail = {
  id?: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  message_id?: string | null;
};

export type ParsedResNexusEmail =
  | {
      ok: true;
      eventType: "RESERVATION";
      reservationReference: string;
      eventKey: string;
      checkIn: string;
      checkOut: string;
    }
  | {
      ok: true;
      eventType: "CANCELLATION";
      reservationReference: string;
      eventKey: string;
      checkIn: null;
      checkOut: null;
    }
  | {
      ok: false;
      reason: string;
      reservationReference: string | null;
      checkIn: string | null;
      checkOut: string | null;
    };

function decodeSecret(secret: string) {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

export function verifyResendWebhookSignature(input: {
  rawBody: string;
  webhookSecret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}) {
  if (!input.id || !input.timestamp || !input.signature) return false;

  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return false;

  // Resend/Svix signs the Unix-seconds timestamp. Reject old/replayed payloads.
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;

  const signed = `${input.id}.${input.timestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", decodeSecret(input.webhookSecret))
    .update(signed)
    .digest("base64");

  for (const part of input.signature.split(/\s+/)) {
    const [version, candidate] = part.split(",", 2);
    if (version !== "v1" || !candidate) continue;

    const left = Buffer.from(expected);
    const right = Buffer.from(candidate);
    if (left.length === right.length && timingSafeEqual(left, right)) {
      return true;
    }
  }

  return false;
}

export async function retrieveResendReceivedEmail(
  emailId: string,
): Promise<ReceivedEmail> {
  const apiKey =
    process.env.RESEND_INBOUND_API_KEY?.trim() ||
    process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "RESEND_INBOUND_API_KEY or RESEND_API_KEY is not configured.",
    );
  }

  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | ReceivedEmail
    | { message?: string }
    | null;

  if (!response.ok || !payload) {
    throw new Error(
      (payload && "message" in payload && payload.message) ||
        `Unable to retrieve received email (HTTP ${response.status}).`,
    );
  }

  return payload as ReceivedEmail;
}

function htmlToText(html: string) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/div|\/tr|\/td|\/th|\/li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeBody(email: ReceivedEmail) {
  const source =
    email.text?.trim() ||
    (email.html ? htmlToText(email.html.slice(0, 500_000)) : "") ||
    "";

  return source
    .slice(0, 250_000)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const monthNumbers: Record<string, number> = {
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

function validIso(year: number, month: number, day: number) {
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

function parseDateCandidate(raw: string) {
  const value = raw
    .replace(/\b(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, "")
    .replace(/\b(?:AM|PM)\b/gi, "")
    .trim();

  let match = value.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (match) {
    return validIso(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return validIso(year, Number(match[1]), Number(match[2]));
  }

  match = value.match(
    /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept?|October|Oct|November|Nov|December|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i,
  );
  if (match) {
    return validIso(
      Number(match[3]),
      monthNumbers[match[1].toLowerCase()],
      Number(match[2]),
    );
  }

  match = value.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept?|October|Oct|November|Nov|December|Dec)(?:,)?\s+(20\d{2})\b/i,
  );
  if (match) {
    return validIso(
      Number(match[3]),
      monthNumbers[match[2].toLowerCase()],
      Number(match[1]),
    );
  }

  return null;
}

function findLabelledDate(body: string, kind: "checkin" | "checkout") {
  const labels =
    kind === "checkin"
      ? "(?:check[ -]?in|arrival(?: date)?)"
      : "(?:check[ -]?out|departure(?: date)?)";

  const pattern = new RegExp(
    `(?:^|\\n)\\s*${labels}\\s*(?:date)?\\s*[:#-]\\s*([^\\n]{4,80})`,
    "gi",
  );
  const values = new Set<string>();
  for (const match of body.matchAll(pattern)) {
    const parsed = parseDateCandidate(match[1]);
    if (parsed) values.add(parsed);
  }
  return values.size === 1 ? [...values][0] : null;
}

function collectReservationReferences(source: string) {
  const patterns = [
    /(?:confirmation|reservation|booking)\s*(?:number|no\.?|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,39})/gi,
    /(?:confirmation|reservation|booking)\s*#\s*([A-Z0-9][A-Z0-9-]{2,39})/gi,
    /(?:confirmation|reservation|booking)\s*:\s*([A-Z0-9][A-Z0-9-]{2,39})/gi,
  ];

  const values = new Set<string>();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) values.add(match[1].toUpperCase());
    }
  }
  return values;
}

function reservationReference(subject: string, body: string) {
  const subjectReferences = collectReservationReferences(subject);
  if (subjectReferences.size === 1) return [...subjectReferences][0];
  if (subjectReferences.size > 1) return null;

  const bodyReferences = collectReservationReferences(body);
  return bodyReferences.size === 1 ? [...bodyReferences][0] : null;
}

function isExplicitCancellation(subject: string, body: string) {
  const subjectCancellation =
    /\b(?:cancelled|canceled)\b/i.test(subject) &&
    /\b(?:reservation|booking|confirmation)\b/i.test(subject);
  if (subjectCancellation) return true;

  const top = body.slice(0, 1600);
  return /(?:^|\n)\s*status\s*[:#-]\s*(?:cancelled|canceled)\b/i.test(top);
}

export function parseResNexusEmail(email: ReceivedEmail): ParsedResNexusEmail {
  const subject = email.subject?.trim() || "";
  const body = normalizeBody(email);
  const reference = reservationReference(subject, body);

  if (!reference) {
    return {
      ok: false,
      reason:
        "A stable ResNexus confirmation/reservation number could not be identified. No dates were changed.",
      reservationReference: null,
      checkIn: null,
      checkOut: null,
    };
  }

  const eventKey = `RESNEXUS:${reference}`;

  if (isExplicitCancellation(subject, body)) {
    return {
      ok: true,
      eventType: "CANCELLATION",
      reservationReference: reference,
      eventKey,
      checkIn: null,
      checkOut: null,
    };
  }

  const checkIn = findLabelledDate(body, "checkin");
  const checkOut = findLabelledDate(body, "checkout");

  if (!checkIn || !checkOut) {
    return {
      ok: false,
      reason:
        "Check-in and checkout could not both be identified from labelled ResNexus fields. No dates were changed.",
      reservationReference: reference,
      checkIn,
      checkOut,
    };
  }

  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  const nights = Math.round((end - start) / 86_400_000);

  if (!Number.isFinite(nights) || nights < 1 || nights > 365) {
    return {
      ok: false,
      reason:
        "The parsed ResNexus date range was not safe to import. No dates were changed.",
      reservationReference: reference,
      checkIn,
      checkOut,
    };
  }

  return {
    ok: true,
    eventType: "RESERVATION",
    reservationReference: reference,
    eventKey,
    checkIn,
    checkOut,
  };
}

export function extractEmailAddress(value: string) {
  const bracket = value.match(/<([^>]+)>/);
  return (bracket?.[1] || value).trim().toLowerCase();
}

export function inboundBridgeToken(addresses: string[]) {
  const domain = process.env.RESNEXUS_INBOUND_DOMAIN?.trim().toLowerCase();
  if (!domain) throw new Error("RESNEXUS_INBOUND_DOMAIN is not configured.");

  for (const raw of addresses) {
    const address = extractEmailAddress(raw);
    const [local, addressDomain] = address.split("@");
    if (addressDomain !== domain) continue;

    const match = local.match(
      /^resnexus-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
    );
    if (match) return match[1].toLowerCase();
  }

  return null;
}

export function resnexusInboundAddress(token: string) {
  const domain = process.env.RESNEXUS_INBOUND_DOMAIN?.trim();
  if (!domain) return null;
  return `resnexus-${token}@${domain}`;
}
