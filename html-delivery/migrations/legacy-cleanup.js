const { buildObjectCopyPlan } = require('./content-object-copy');

const MIN_USAGE_WINDOW_DAYS = 7;
const MIN_USAGE_WINDOW_MS = MIN_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function normalizeUsageEvidence(evidence) {
  if (!evidence) return { complete: false, reasons: ['missing-usage-evidence'], requestsByKey: new Map() };
  const observedFrom = Date.parse(evidence.observedFrom);
  const observedTo = Date.parse(evidence.observedTo);
  const validWindow = Number.isFinite(observedFrom)
    && Number.isFinite(observedTo)
    && observedTo > observedFrom
    && observedTo - observedFrom >= MIN_USAGE_WINDOW_MS;
  const validScope = evidence.complete === true && evidence.prefix === 'games/' && evidence.source === 'cloudfront-access-log';
  const requests = evidence.requestsByKey && typeof evidence.requestsByKey === 'object' ? evidence.requestsByKey : {};
  const invalidCounts = Object.entries(requests).filter(([key, count]) => !key.startsWith('games/') || !Number.isInteger(count) || count < 0);
  const reasons = [];
  if (!validWindow) reasons.push('insufficient-observation-window');
  if (!validScope) reasons.push('invalid-usage-evidence-scope');
  if (invalidCounts.length) reasons.push('invalid-request-counts');
  return {
    complete: reasons.length === 0,
    reasons,
    requestsByKey: new Map(Object.entries(requests)),
    observedFrom: evidence.observedFrom,
    observedTo: evidence.observedTo,
  };
}

function summarize(objects) {
  return objects.reduce((summary, object) => {
    summary.legacyObjects += 1;
    if (object.registered) summary.registeredObjects += 1;
    if (object.mirrorState === 'verified') summary.verifiedMirrors += 1;
    if (object.state === 'eligible') summary.deletionCandidates += 1;
    if (object.state === 'active-reference') summary.activeReferenceObjects += 1;
    if (object.state === 'awaiting-usage-evidence') summary.awaitingUsageEvidence += 1;
    if (object.state === 'observed-usage') summary.observedUsageObjects += 1;
    if (object.state === 'orphan-unmapped') summary.orphanObjects += 1;
    if (object.state === 'mirror-blocked') summary.mirrorBlockedObjects += 1;
    return summary;
  }, {
    legacyObjects: 0,
    registeredObjects: 0,
    verifiedMirrors: 0,
    deletionCandidates: 0,
    activeReferenceObjects: 0,
    awaitingUsageEvidence: 0,
    observedUsageObjects: 0,
    orphanObjects: 0,
    mirrorBlockedObjects: 0,
  });
}

async function buildLegacyCleanupPlan({ contents, legacyObjects, v2Objects, fingerprint, usageEvidence, concurrency = 8 }) {
  const copyPlan = await buildObjectCopyPlan({
    contents,
    sourceObjects: legacyObjects,
    destinationObjects: v2Objects,
    fingerprint,
    concurrency,
  });
  const evidence = normalizeUsageEvidence(usageEvidence);
  const activeReferences = new Set();
  for (const content of contents) {
    for (const key of [content.latestKey, content.latestObjectKey]) {
      if (typeof key === 'string' && key.startsWith('games/')) activeReferences.add(key);
    }
  }
  const versions = new Map();
  for (const content of copyPlan.contents) {
    for (const version of content.versions || []) versions.set(version.sourceKey, version);
  }
  const orphanKeys = new Set(copyPlan.orphanSourceKeys);
  const objects = legacyObjects.map((object) => {
    const version = versions.get(object.key);
    const registered = Boolean(version);
    const mirrorState = version?.state || 'unmapped';
    const requests = evidence.requestsByKey.get(object.key) || 0;
    let state;
    let reasons;
    if (orphanKeys.has(object.key) || !registered) {
      state = 'orphan-unmapped';
      reasons = ['manual-ownership-review-required'];
    } else if (mirrorState !== 'verified') {
      state = 'mirror-blocked';
      reasons = [`mirror-${mirrorState}`];
    } else if (activeReferences.has(object.key)) {
      state = 'active-reference';
      reasons = ['registry-still-references-legacy-key'];
    } else if (!evidence.complete) {
      state = 'awaiting-usage-evidence';
      reasons = evidence.reasons;
    } else if (requests > 0) {
      state = 'observed-usage';
      reasons = ['legacy-requests-observed'];
    } else {
      state = 'eligible';
      reasons = [];
    }
    return {
      key: object.key,
      sizeBytes: object.sizeBytes,
      registered,
      mirrorKey: version?.destinationKey || null,
      mirrorState,
      activeReference: activeReferences.has(object.key),
      observedRequests: evidence.complete ? requests : null,
      state,
      reasons,
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
  return {
    summary: {
      contents: contents.length,
      expectedVersions: copyPlan.summary.expectedVersions,
      ...summarize(objects),
      usageEvidenceComplete: evidence.complete,
    },
    usageEvidence: {
      complete: evidence.complete,
      reasons: evidence.reasons,
      observedFrom: evidence.observedFrom || null,
      observedTo: evidence.observedTo || null,
      minimumWindowDays: MIN_USAGE_WINDOW_DAYS,
    },
    objects,
  };
}

module.exports = {
  MIN_USAGE_WINDOW_DAYS,
  buildLegacyCleanupPlan,
  normalizeUsageEvidence,
  summarize,
};
