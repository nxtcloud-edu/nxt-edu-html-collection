const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildLegacyCleanupPlan, normalizeUsageEvidence } = require('../migrations/legacy-cleanup');
const { parseArgs } = require('../scripts/audit-legacy-cleanup');

function fakeStore(entries) {
  const objects = new Map(Object.entries(entries).map(([key, value]) => [key, Buffer.from(value)]));
  const list = (prefix) => [...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, body]) => ({ key, sizeBytes: body.length }));
  const fingerprint = async (key) => {
    const body = objects.get(key);
    return body ? { sizeBytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') } : null;
  };
  return { fingerprint, list };
}

function content(contentId, latestVersion = 2, fields = {}) {
  return {
    contentId,
    latestVersion,
    latestKey: `games/${contentId}-v${latestVersion}.html`,
    latestObjectKey: `contents/${contentId}/v${latestVersion}.html`,
    ...fields,
  };
}

function completeEvidence(requestsByKey = {}) {
  return {
    complete: true,
    source: 'cloudfront-access-log',
    prefix: 'games/',
    observedFrom: '2026-08-01T00:00:00.000Z',
    observedTo: '2026-08-08T00:00:00.000Z',
    requestsByKey,
  };
}

test('활성 fallback, 관찰 근거 없음, orphan은 삭제 후보에서 제외한다', async () => {
  const store = fakeStore({
    'games/aaaaaaaa-v1.html': 'one',
    'games/aaaaaaaa-v2.html': 'two',
    'contents/aaaaaaaa/v1.html': 'one',
    'contents/aaaaaaaa/v2.html': 'two',
    'games/unmapped.html': 'unknown',
  });
  const plan = await buildLegacyCleanupPlan({
    contents: [content('aaaaaaaa')],
    legacyObjects: store.list('games/'),
    v2Objects: store.list('contents/'),
    fingerprint: store.fingerprint,
  });
  assert.equal(plan.summary.deletionCandidates, 0);
  assert.equal(plan.summary.activeReferenceObjects, 1);
  assert.equal(plan.summary.awaitingUsageEvidence, 1);
  assert.equal(plan.summary.orphanObjects, 1);
  assert.equal(plan.summary.verifiedMirrors, 2);
});

test('7일 완전 관찰 후 요청 0인 비참조 객체만 후보가 된다', async () => {
  const store = fakeStore({
    'games/bbbbbbbb-v1.html': 'one',
    'games/bbbbbbbb-v2.html': 'two',
    'contents/bbbbbbbb/v1.html': 'one',
    'contents/bbbbbbbb/v2.html': 'two',
  });
  const plan = await buildLegacyCleanupPlan({
    contents: [content('bbbbbbbb')],
    legacyObjects: store.list('games/'),
    v2Objects: store.list('contents/'),
    fingerprint: store.fingerprint,
    usageEvidence: completeEvidence(),
  });
  assert.equal(plan.summary.deletionCandidates, 1);
  assert.equal(plan.objects.find((object) => object.key.endsWith('-v1.html')).state, 'eligible');
  assert.equal(plan.objects.find((object) => object.key.endsWith('-v2.html')).state, 'active-reference');
});

test('관찰된 요청과 불일치 복사본은 삭제를 차단한다', async () => {
  const store = fakeStore({
    'games/cccccccc-v1.html': 'source',
    'games/cccccccc-v2.html': 'latest',
    'contents/cccccccc/v1.html': 'different',
    'contents/cccccccc/v2.html': 'latest',
  });
  const plan = await buildLegacyCleanupPlan({
    contents: [content('cccccccc')],
    legacyObjects: store.list('games/'),
    v2Objects: store.list('contents/'),
    fingerprint: store.fingerprint,
    usageEvidence: completeEvidence({ 'games/cccccccc-v1.html': 3 }),
  });
  assert.equal(plan.summary.mirrorBlockedObjects, 1);
  assert.equal(plan.summary.deletionCandidates, 0);
});

test('불완전한 사용량 근거와 삭제 옵션을 거부한다', () => {
  assert.equal(normalizeUsageEvidence({ ...completeEvidence(), observedTo: '2026-08-02T00:00:00.000Z' }).complete, false);
  assert.deepEqual(parseArgs([]), { report: '', summaryOnly: false, usageReport: '', concurrency: 6 });
  assert.throws(() => parseArgs(['--apply']), /읽기 전용/);
  assert.throws(() => parseArgs(['--confirm=DELETE']), /읽기 전용/);
  assert.throws(() => parseArgs(['--concurrency=17']), /1~16/);
});
