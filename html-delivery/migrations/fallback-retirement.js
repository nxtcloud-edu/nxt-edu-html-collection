const { createLegacyVersionKey, createV2VersionKey } = require('../domain/content-storage');
const { mapLimit } = require('./content-object-copy');
const { normalizeUsageEvidence } = require('./legacy-cleanup');

function summarize(contents) {
  return contents.reduce((summary, content) => {
    summary.contents += 1;
    if (content.status === 'ready') summary.ready += 1;
    if (content.status === 'retired') summary.retired += 1;
    if (content.status === 'awaiting-usage-evidence') summary.awaitingUsageEvidence += 1;
    if (content.status === 'observed-usage') summary.observedUsage += 1;
    if (content.status === 'blocked') summary.blocked += 1;
    if (content.status === 'conflict') summary.conflicts += 1;
    return summary;
  }, { contents: 0, ready: 0, retired: 0, awaitingUsageEvidence: 0, observedUsage: 0, blocked: 0, conflicts: 0 });
}

function buildFallbackRetirementPlan({ contents, copyPlan, usageEvidence }) {
  const evidence = normalizeUsageEvidence(usageEvidence);
  const copyById = new Map(copyPlan.contents.map((content) => [content.contentId, content]));
  const planned = contents.map((content) => {
    const expectedLegacyKey = createLegacyVersionKey(content.contentId, content.latestVersion);
    const expectedV2Key = createV2VersionKey(content.contentId, content.latestVersion);
    const common = { contentId: content.contentId, expectedLegacyKey, expectedV2Key };
    if (content.latestKey === expectedV2Key && (!content.latestObjectKey || content.latestObjectKey === expectedV2Key)) {
      return { ...common, status: 'retired', reasons: [] };
    }
    if (content.latestKey !== expectedLegacyKey) {
      return { ...common, status: 'conflict', reasons: ['unexpected-latest-key'], currentLatestKey: content.latestKey };
    }
    if (content.latestObjectKey !== expectedV2Key) {
      return { ...common, status: 'conflict', reasons: ['unexpected-latest-object-key'], currentLatestObjectKey: content.latestObjectKey || null };
    }
    if (copyById.get(content.contentId)?.status !== 'verified') {
      return { ...common, status: 'blocked', reasons: ['copy-not-verified'] };
    }
    if (!evidence.complete) {
      return { ...common, status: 'awaiting-usage-evidence', reasons: evidence.reasons };
    }
    const legacyPrefix = `games/${content.contentId}-v`;
    const observedRequests = [...evidence.requestsByKey.entries()]
      .filter(([key]) => key.startsWith(legacyPrefix))
      .reduce((total, [, count]) => total + count, 0);
    if (observedRequests > 0) {
      return { ...common, status: 'observed-usage', reasons: ['legacy-requests-observed'], observedRequests };
    }
    return { ...common, status: 'ready', reasons: [], observedRequests: 0 };
  });
  return {
    summary: { ...summarize(planned), usageEvidenceComplete: evidence.complete },
    usageEvidence: {
      complete: evidence.complete,
      reasons: evidence.reasons,
      observedFrom: evidence.observedFrom || null,
      observedTo: evidence.observedTo || null,
    },
    contents: planned,
  };
}

async function applyFallbackRetirementPlan({ plan, retireFallback, concurrency = 6 }) {
  const eligible = plan.contents.filter((content) => content.status === 'ready');
  const results = await mapLimit(eligible, concurrency, async (content) => {
    try {
      const updated = await retireFallback(content);
      return updated ? { contentId: content.contentId, ok: true } : { contentId: content.contentId, ok: false, error: 'conditional-update-conflict' };
    } catch (error) {
      return { contentId: content.contentId, ok: false, error: error.message };
    }
  });
  return {
    attemptedContents: eligible.length,
    succeededContents: results.filter((result) => result.ok).length,
    failedContents: results.filter((result) => !result.ok).length,
    results,
  };
}

module.exports = { applyFallbackRetirementPlan, buildFallbackRetirementPlan, summarize };
