const MAX_QUARANTINE_DAYS = 62;
const MAX_DETAIL_CORRECTION_DRIFT_DAYS = 2;

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

function absoluteDateDrift(left, right) {
  const drift = daysBetween(left, right);
  return Number.isFinite(drift) ? Math.abs(drift) : Number.POSITIVE_INFINITY;
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
  // A verified correction is authoritative. Resolve its target label before
  // looking at the raw fan-out block's resource_key. Otherwise every raw copy
  // of one ambiguous reservation can be rewritten as an exact reservation on
  // every mapped property.
  const preferred = normalize(preferredLabel);
  if (preferred) {
    const byPreferredLabel = resources.find(
      (resource) => normalize(resource.label) === preferred,
    );
    if (byPreferredLabel) return byPreferredLabel;
  }

  const byKey = resources.find(
    (resource) => resource.key === clean(block?.resource_key),
  );
  if (byKey) return byKey;

  const original = normalize(
    block?.resource_label || block?.metadata?.resource,
  );
  if (original) {
    const byOriginal = resources.find(
      (resource) => normalize(resource.label) === original,
    );
    if (byOriginal) return byOriginal;
  }

  return null;
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

function overlapRecordIds(verifier) {
  const ids = new Set();

  for (const overlap of verifier?.overlaps || []) {
    for (const side of [overlap?.first, overlap?.second]) {
      const uid = clean(side?.uid);
      if (!uid) continue;
      ids.add(uid.startsWith("AMBIG:") ? uid.slice(6) : uid);
    }
  }

  return ids;
}

function correctionConflictsWithOriginal(block, correction) {
  const originalStart = clean(block?.start);
  const originalEnd = clean(block?.end);
  const correctedStart = clean(correction?.toStart);
  const correctedEnd = clean(correction?.toEnd);

  if (
    !reasonableQuarantineRange(originalStart, originalEnd) ||
    !reasonableQuarantineRange(correctedStart, correctedEnd)
  ) {
    return true;
  }

  return (
    absoluteDateDrift(originalStart, correctedStart) >
      MAX_DETAIL_CORRECTION_DRIFT_DAYS ||
    absoluteDateDrift(originalEnd, correctedEnd) >
      MAX_DETAIL_CORRECTION_DRIFT_DAYS
  );
}

function quarantineBlock({
  block,
  resources,
  recordId,
  reason,
  preferredLabel,
  rejectedImplausible,
  quarantined,
}) {
  const start = clean(block?.start);
  const end = clean(block?.end);

  if (!reasonableQuarantineRange(start, end)) {
    rejectedImplausible.push({
      recordId,
      start,
      end,
      reason: reason || "unverified_implausible_range",
      originalResource: clean(
        preferredLabel || block?.resource_label || block?.metadata?.resource,
      ),
    });
    return null;
  }

  const resource = findResource(resources, block, preferredLabel);
  if (!resource) {
    return null;
  }

  const stableRecord = recordId || clean(block?.uid) || "UNKNOWN";
  const key =
    `RESNEXUS:AMBIG:${stableRecord}:${resource.key}:${start}:${end}`;

  quarantined.push({
    recordId: stableRecord,
    start,
    end,
    resource: resource.label,
    reason: reason || "unresolved",
  });

  return {
    ...block,
    key,
    uid: `AMBIG:${stableRecord}`,
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
      verification_failure: reason || "unresolved",
    },
  };
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
    !verifier
  ) {
    return null;
  }

  const failures = Array.isArray(verifier.failures)
    ? verifier.failures
    : [];
  const overlaps = Array.isArray(verifier.overlaps)
    ? verifier.overlaps
    : [];

  if (!failures.length && !overlaps.length) {
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
  for (const failure of failures) {
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
  const overlapIds = overlapRecordIds(verifier);

  const output = [];
  const quarantined = [];
  const rejectedImplausible = [];
  const rejectedCorrections = [];

  for (const block of snapshot.blocks) {
    const recordId = recordIdFromBlock(block);

    if (recordId && inactive.has(recordId)) {
      continue;
    }

    const failure = recordId ? failuresByRecordId.get(recordId) : null;
    const correction = recordId
      ? correctionsByRecordId.get(recordId)
      : null;
    const overlapConflict = Boolean(recordId && overlapIds.has(recordId));
    const correctionConflict = Boolean(
      correction && correctionConflictsWithOriginal(block, correction),
    );

    if (failure || overlapConflict || correctionConflict) {
      let reason = clean(failure?.reason);

      if (!reason && overlapConflict) {
        reason = "verified_overlap_conflict";
      }

      if (!reason && correctionConflict) {
        reason = "detail_date_conflict";
      }

      if (correctionConflict && recordId) {
        rejectedCorrections.push({
          recordId,
          originalStart: clean(block?.start),
          originalEnd: clean(block?.end),
          proposedStart: clean(correction?.toStart),
          proposedEnd: clean(correction?.toEnd),
          proposedResource: clean(correction?.toResource),
          reason,
        });
      }

      const quarantinedBlock = quarantineBlock({
        block,
        resources,
        recordId,
        reason,
        preferredLabel:
          failure?.originalResource ||
          correction?.fromResource ||
          block?.resource_label,
        rejectedImplausible,
        quarantined,
      });

      if (quarantinedBlock) {
        output.push(quarantinedBlock);
      }

      continue;
    }

    if (correction) {
      const resource = findResource(
        resources,
        block,
        correction.toResource,
      );
      const start = clean(correction.toStart || block.start);
      const end = clean(correction.toEnd || block.end);

      if (!resource || !reasonableQuarantineRange(start, end)) {
        const quarantinedBlock = quarantineBlock({
          block,
          resources,
          recordId,
          reason: "detail_correction_not_safe",
          preferredLabel:
            correction.fromResource || block?.resource_label,
          rejectedImplausible,
          quarantined,
        });

        if (quarantinedBlock) {
          output.push(quarantinedBlock);
          continue;
        }

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
        version: "detail-proof-v4-correction-priority",
        recoveryMode:
          "quarantine_unresolved_and_preserve_verified_resource",
        recoveredOutputBlocks: blocks.length,
        quarantinedFailures: quarantined.slice(0, 100),
        rejectedImplausibleFailures:
          rejectedImplausible.slice(0, 100),
        rejectedDetailCorrections:
          rejectedCorrections.slice(0, 100),
      },
    },
  };
}
