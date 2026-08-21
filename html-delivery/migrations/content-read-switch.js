const { createV2VersionKey, storageSchemeForKey } = require('../domain/content-storage');
const { mapLimit } = require('./content-object-copy');

function summarize(contents) {
  return contents.reduce((summary, content) => {
    summary.contents += 1;
    if (content.status === 'ready') summary.ready += 1;
    if (content.status === 'switched') summary.switched += 1;
    if (content.status === 'native-v2') summary.nativeV2 += 1;
    if (content.status === 'blocked') summary.blocked += 1;
    if (content.status === 'conflict') summary.conflicts += 1;
    return summary;
  }, { contents: 0, ready: 0, switched: 0, nativeV2: 0, blocked: 0, conflicts: 0 });
}

function buildContentReadSwitchPlan({ contents, copyPlan }) {
  const copyById = new Map(copyPlan.contents.map((content) => [content.contentId, content]));
  const planned = contents.map((content) => {
    if (storageSchemeForKey(content.latestKey) === 'v2-contents') {
      return { contentId: content.contentId, status: 'native-v2', expectedLatestKey: content.latestKey, latestObjectKey: content.latestObjectKey || content.latestKey, reasons: [] };
    }
    const latestObjectKey = createV2VersionKey(content.contentId, content.latestVersion);
    if (content.latestObjectKey === latestObjectKey) {
      return { contentId: content.contentId, status: 'switched', expectedLatestKey: content.latestKey, latestObjectKey, reasons: [] };
    }
    if (content.latestObjectKey && content.latestObjectKey !== content.latestKey) {
      return { contentId: content.contentId, status: 'conflict', expectedLatestKey: content.latestKey, latestObjectKey, currentLatestObjectKey: content.latestObjectKey, reasons: ['unexpected-latest-object-key'] };
    }
    if (copyById.get(content.contentId)?.status !== 'verified') {
      return { contentId: content.contentId, status: 'blocked', expectedLatestKey: content.latestKey, latestObjectKey, reasons: ['copy-not-verified'] };
    }
    return { contentId: content.contentId, status: 'ready', expectedLatestKey: content.latestKey, latestObjectKey, reasons: [] };
  });
  return { summary: summarize(planned), contents: planned };
}

async function applyContentReadSwitchPlan({ plan, updatePointer, concurrency = 6 }) {
  const eligible = plan.contents.filter((content) => content.status === 'ready');
  const results = await mapLimit(eligible, concurrency, async (content) => {
    try {
      const updated = await updatePointer(content);
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

module.exports = { applyContentReadSwitchPlan, buildContentReadSwitchPlan, summarize };
