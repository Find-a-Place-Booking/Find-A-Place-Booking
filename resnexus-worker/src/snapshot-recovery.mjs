const MAX_QUARANTINE_DAYS = 62;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function daysBetween(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || ""))) return NaN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(end || ""))) return NaN;
  const left = new Date(`${start}T00:00:00Z`).getTime();
  const right = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
  return Math.round((right - left) / 86_400_000);
}

function recordIdFromBlock(block) {
  const uid = clean(block?.uid);
  const key = clean(block?.key);

  if (uid.startsWith("AMBIG:")) {
    const value = uid.slice(6);
    return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
  }

  if (/^[A-Za-z0-9_-]{1,80}$/.test(uid)) return uid;

  const match = key.match(/^RESNEXUS:(?:AMBIG:)?([A-Za-z0-9_-]{1,80})(?::|$)/);
  return match?.[1] || null;
}

function reasonableQuarantineRange(start, end) {
  const span = daysBetween(start, end);
  return Number.isFinite(span) && span >= 1 && span <= MAX_QUARANTINE_DAYS;
}

function findResource(resources, block, preferredLabel) {
  const byKey = resources.find(
    (resource) => resource.key === clean(block?.resource_key),
  );
  if (byKey) return byKey;

  const preferred = normalize(preferredLabel);
  if (preferred) {
    const byLabel = resources.find(
      (resource) => normalize(resource.label) === preferred,
    );
    if (byLabel) return byLabel;
  }

  const original = normalize(
    block?.resource_label || block?.metadata?.resource,
  );
  if (original) {
    const byOriginal = resources.find(
      (resource) => normalize(resource.label) === original,
    );
    if (byOriginal) return byOriginal;
  }

  return resources[0] || null;
}

function dedupeBlocks(blocks) {
  const unique = new Map();

  for (const block of blocks) {
    const identity = [
      clean(block?.uid),
      clean(block?.resource_key),
      clean(block?.start),
      clean(block?.end),
      clean(block?.metadata?.extractor),
    ].join("|");

    unique.set(identity, block);
  }

  return [...unique.values()];
}

export function recoverResNexusSnapshotAfterVerificationError({
  snapshot,
  error,
}) {
  const verifier = error?.diagnostic?.verifier;

  if (
    !snapshot ||
    !Array.isArray(snapshot.blocks) ||
    !Array.isArray(snapshot.resources) ||
    !verifier ||
    !Array.isArray(verifier.failures) ||
    verifier.failures.length === 0
  ) {
    return null;
  }

  // Overlapping exact reservations are a different safety problem. Do not
  // weaken that guard here; this recovery is only for rows whose detail proof
  // is incomplete.
  if (Array.isArray(verifier.overlaps) && verifier.overlaps.length > 0) {
    return null;
  }

  const resources = snapshot.resources
    .filter(
      (resource) =>
        resource &&
        typeof resource.key === "string" &&
        typeof resource.label === "string",
    )
    .map((resource) => ({
      key: clean(resource.key),
      label: clean(resource.label),
    }));

  if (!resources.length) return null;

  const failuresByRecordId = new Map();
  for (const failure of verifier.failures) {
    const recordId = clean(failure?.recordId);
    if (recordId) failuresByRecordId.set(recordId, failure);
  }

  const correctionsByRecordId = new Map();
  for (const correction of verifier.correctedBlocks || []) {
    const recordId = clean(correction?.recordId);
    if (recordId) correctionsByRecordId.set(recordId, correction);
  }

  const inactive = new Set(
    (verifier.inactiveRecords || []).map((value) => clean(value)),
  );

  const output = [];
  const quarantined = [];
  const rejectedImplausible = [];

  for (const block of snapshot.blocks) {
    const recordId = recordIdFromBlock(block);

    if (recordId && inactive.has(recordId)) {
      continue;
    }

    const failure = recordId ? failuresByRecordId.get(recordId) : null;

    if (failure) {
      const start = clean(failure.start || block.start);
      const end = clean(failure.end || block.end);

      // Do not let a known-bad list-row parse quarantine months of inventory.
      // The live failure that exposed this was Lil' Rustic 2026-08-21 ->
      // 2027-01-03. Long unverified spans are discarded and logged instead.
      if (!reasonableQuarantineRange(start, end)) {
        rejectedImplausible.push({
          recordId,
          start,
          end,
          reason: clean(failure.reason) || "unverified_implausible_range",
          originalResource: clean(
            failure.originalResource || block?.resource_label,
          ),
        });
        continue;
      }

      const resource = findResource(
        resources,
        block,
        failure.originalResource,
      );
      if (!resource) return null;

      const key = `RESNEXUS:AMBIG:${recordId || "UNKNOWN"}:${resource.key}:${start}:${end}`;

      output.push({
        ...block,
        key,
        uid: `AMBIG:${recordId || key}`,
        start,
        end,
        resource_key: resource.key,
        resource_label: resource.label,
        metadata: {
          ...(block.metadata || {}),
          provider: "RESNEXUS",
          source: "persistent_browser",
          resource: resource.label,
          extractor: "ambiguous_reservation_safety_block",
          verification: "detail_proof_unresolved",
          verification_failure: clean(failure.reason) || "unresolved",
        },
      });

      quarantined.push({
        recordId,
        start,
        end,
        resource: resource.label,
        reason: clean(failure.reason) || "unresolved",
      });
      continue;
    }

    const correction = recordId
      ? correctionsByRecordId.get(recordId)
      : null;

    if (correction) {
      const resource = findResource(
        resources,
        block,
        correction.toResource,
      );
      const start = clean(correction.toStart || block.start);
      const end = clean(correction.toEnd || block.end);

      if (!resource || !reasonableQuarantineRange(start, end)) {
        return null;
      }

      output.push({
        ...block,
        key: `RESNEXUS:${recordId}`,
        uid: recordId,
        start,
        end,
        resource_key: resource.key,
        resource_label: resource.label,
        metadata: {
          ...(block.metadata || {}),
          provider: "RESNEXUS",
          source: "persistent_browser",
          resource: resource.label,
          extractor: "verified_reservation_detail",
          verification: clean(correction.confidence) || "detail_proof",
        },
      });
      continue;
    }

    output.push(block);
  }

  const blocks = dedupeBlocks(output);

  return {
    ...snapshot,
    blocks,
    diagnostic: {
      ...(error.diagnostic || snapshot.diagnostic || {}),
      verifier: {
        ...verifier,
        version: "detail-proof-v2-quarantine-recovery",
        recoveryMode: "quarantine_unresolved_ranges",
        recoveredOutputBlocks: blocks.length,
        quarantinedFailures: quarantined.slice(0, 100),
        rejectedImplausibleFailures: rejectedImplausible.slice(0, 100),
      },
    },
  };
}
