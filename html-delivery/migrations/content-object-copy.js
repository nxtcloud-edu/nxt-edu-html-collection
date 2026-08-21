const { contentKeyParts, createLegacyVersionKey, createV2VersionKey } = require('../domain/content-storage');

function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)).then(() => results);
}

function sameFingerprint(left, right) {
  return Boolean(left && right && left.sizeBytes === right.sizeBytes && left.sha256 === right.sha256);
}

function expectedVersionPairs(content) {
  const parts = contentKeyParts(content.latestKey);
  if (!parts || parts.storageScheme !== 'legacy-games' || parts.contentId !== content.contentId || parts.version !== content.latestVersion) return null;
  return Array.from({ length: content.latestVersion }, (_, index) => {
    const version = index + 1;
    return {
      version,
      sourceKey: createLegacyVersionKey(content.contentId, version),
      destinationKey: createV2VersionKey(content.contentId, version),
    };
  });
}

function summarizePlan(contents, orphanSourceKeys) {
  const summary = {
    contents: contents.length,
    ready: 0,
    verified: 0,
    blocked: 0,
    conflicts: 0,
    skippedV2: 0,
    expectedVersions: 0,
    pendingCopies: 0,
    verifiedCopies: 0,
    totalBytesToCopy: 0,
    orphanSourceObjects: orphanSourceKeys.length,
  };
  for (const content of contents) {
    if (content.status === 'ready') summary.ready += 1;
    if (content.status === 'verified') summary.verified += 1;
    if (content.status === 'blocked') summary.blocked += 1;
    if (content.status === 'conflict') summary.conflicts += 1;
    if (content.status === 'skipped-v2') summary.skippedV2 += 1;
    summary.expectedVersions += content.expectedVersionCount || 0;
    for (const version of content.versions || []) {
      if (version.state === 'pending') {
        summary.pendingCopies += 1;
        summary.totalBytesToCopy += version.source.sizeBytes;
      }
      if (version.state === 'verified') summary.verifiedCopies += 1;
    }
  }
  return summary;
}

async function buildObjectCopyPlan({ contents, sourceObjects, destinationObjects, fingerprint, concurrency = 8 }) {
  const sourceKeys = new Set(sourceObjects.map((object) => object.key));
  const destinationKeys = new Set(destinationObjects.map((object) => object.key));
  const allExpectedSourceKeys = new Set();
  const expectedByContent = new Map();

  for (const content of contents) {
    const pairs = expectedVersionPairs(content);
    expectedByContent.set(content.contentId, pairs);
    for (const pair of pairs || []) allExpectedSourceKeys.add(pair.sourceKey);
  }

  const plannedContents = await mapLimit(contents, concurrency, async (content) => {
    const latestParts = contentKeyParts(content.latestKey);
    if (latestParts?.storageScheme === 'v2-contents') {
      return { contentId: content.contentId, status: 'skipped-v2', reasons: [], expectedVersionCount: 0, versions: [] };
    }
    const pairs = expectedByContent.get(content.contentId);
    if (!pairs) return { contentId: content.contentId, status: 'blocked', reasons: ['invalid-latest-key'], expectedVersionCount: 0, versions: [] };
    const expectedVersionCount = pairs.length;

    const expectedKeys = new Set(pairs.map((pair) => pair.sourceKey));
    const actualKeys = [...sourceKeys].filter((key) => contentKeyParts(key)?.contentId === content.contentId);
    const missingSourceKeys = [...expectedKeys].filter((key) => !sourceKeys.has(key));
    const extraSourceKeys = actualKeys.filter((key) => !expectedKeys.has(key));
    if (missingSourceKeys.length || extraSourceKeys.length) {
      return {
        contentId: content.contentId,
        status: 'blocked',
        reasons: ['source-version-count-mismatch'],
        expectedVersionCount,
        missingSourceKeys,
        extraSourceKeys,
        versions: [],
      };
    }

    const versions = await mapLimit(pairs, Math.min(concurrency, pairs.length), async (pair) => {
      const source = await fingerprint(pair.sourceKey);
      if (!source) return { ...pair, state: 'missing-source', source: null, destination: null };
      if (!destinationKeys.has(pair.destinationKey)) return { ...pair, state: 'pending', source, destination: null };
      const destination = await fingerprint(pair.destinationKey);
      return {
        ...pair,
        state: sameFingerprint(source, destination) ? 'verified' : 'conflict',
        source,
        destination,
      };
    });
    if (versions.some((version) => version.state === 'missing-source')) {
      return { contentId: content.contentId, status: 'blocked', reasons: ['source-read-failed'], expectedVersionCount, versions };
    }
    if (versions.some((version) => version.state === 'conflict')) {
      return { contentId: content.contentId, status: 'conflict', reasons: ['destination-mismatch'], expectedVersionCount, versions };
    }
    return {
      contentId: content.contentId,
      status: versions.every((version) => version.state === 'verified') ? 'verified' : 'ready',
      reasons: [],
      expectedVersionCount,
      versions,
    };
  });

  const orphanSourceKeys = [...sourceKeys].filter((key) => !allExpectedSourceKeys.has(key)).sort();
  return { summary: summarizePlan(plannedContents, orphanSourceKeys), orphanSourceKeys, contents: plannedContents };
}

async function applyObjectCopyPlan({ plan, copyVersion, concurrency = 4 }) {
  const eligible = plan.contents.filter((content) => content.status === 'ready');
  const results = await mapLimit(eligible, concurrency, async (content) => {
    const copied = [];
    try {
      for (const version of content.versions.filter((item) => item.state === 'pending')) {
        await copyVersion(version);
        copied.push(version.destinationKey);
      }
      return { contentId: content.contentId, ok: true, copied };
    } catch (error) {
      return { contentId: content.contentId, ok: false, copied, error: error.message };
    }
  });
  return {
    attemptedContents: eligible.length,
    succeededContents: results.filter((result) => result.ok).length,
    failedContents: results.filter((result) => !result.ok).length,
    copiedObjects: results.reduce((total, result) => total + result.copied.length, 0),
    results,
  };
}

module.exports = {
  applyObjectCopyPlan,
  buildObjectCopyPlan,
  expectedVersionPairs,
  mapLimit,
  sameFingerprint,
  summarizePlan,
};
