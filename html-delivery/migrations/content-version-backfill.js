const crypto = require('node:crypto');
const { createVersionKey, preferredContentKey } = require('../domain/content-storage');

function summarizeVersionBackfill(plan) {
  return {
    contents: plan.contents.length,
    expectedVersions: plan.contents.reduce((sum, item) => sum + item.expectedVersions, 0),
    ready: plan.ready.length,
    existing: plan.existing.length,
    conflicts: plan.conflicts.length,
    failures: plan.failures.length,
  };
}

async function planContentVersionBackfill({ contents, listVersions, inspectObject }) {
  const plan = { contents: [], ready: [], existing: [], conflicts: [], failures: [] };
  for (const content of contents) {
    const stored = await listVersions(content.contentId);
    const storedByVersion = new Map(stored.map((item) => [item.version, item]));
    const result = { contentId: content.contentId, expectedVersions: content.latestVersion };
    plan.contents.push(result);
    for (let version = 1; version <= content.latestVersion; version += 1) {
      const objectKey = createVersionKey(content.contentId, version, { existingKey: preferredContentKey(content) });
      try {
        const object = await inspectObject(objectKey);
        const candidate = {
          contentId: content.contentId,
          version,
          objectKey,
          originalFileName: null,
          sizeBytes: object.body.length,
          sha256: crypto.createHash('sha256').update(object.body).digest('hex'),
          uploadedAt: version === content.latestVersion ? content.updatedAt : (version === 1 ? content.createdAt2 : null),
        };
        const current = storedByVersion.get(version);
        if (!current) plan.ready.push(candidate);
        else if (current.objectKey === candidate.objectKey && current.sizeBytes === candidate.sizeBytes && current.sha256 === candidate.sha256) plan.existing.push(candidate);
        else plan.conflicts.push({ candidate, current });
      } catch (error) {
        plan.failures.push({ contentId: content.contentId, version, objectKey, code: error.name || error.code || 'ERROR' });
      }
    }
  }
  plan.summary = summarizeVersionBackfill(plan);
  return plan;
}

async function applyContentVersionBackfill(plan, { saveVersion, concurrency = 4 }) {
  if (plan.conflicts.length || plan.failures.length) throw new Error('충돌 또는 객체 읽기 실패가 있어 backfill을 중단합니다.');
  const queue = [...plan.ready];
  const results = [];
  async function worker() {
    while (queue.length) {
      const record = queue.shift();
      results.push({ record, created: await saveVersion(record) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
  return {
    created: results.filter((item) => item.created).length,
    conflicts: results.filter((item) => !item.created).length,
  };
}

module.exports = { applyContentVersionBackfill, planContentVersionBackfill, summarizeVersionBackfill };
