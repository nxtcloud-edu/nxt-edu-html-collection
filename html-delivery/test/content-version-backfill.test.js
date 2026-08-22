const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { applyContentVersionBackfill, planContentVersionBackfill } = require('../migrations/content-version-backfill');
const { CONFIRM, parseArgs } = require('../scripts/backfill-content-versions');

const content = {
  contentId: 'abc12345', latestVersion: 2, latestKey: 'games/abc12345-v2.html', latestObjectKey: 'contents/abc12345/v2.html',
  createdAt2: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
};

function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

test('버전 backfill dry-run은 v2 객체 해시·크기와 기존 레코드 일치를 분류한다', async () => {
  const body1 = Buffer.from('one');
  const body2 = Buffer.from('two');
  const existing = [{ contentId: content.contentId, version: 1, objectKey: 'contents/abc12345/v1.html', sizeBytes: body1.length, sha256: sha(body1) }];
  const plan = await planContentVersionBackfill({
    contents: [content],
    listVersions: async () => existing,
    inspectObject: async (key) => ({ body: key.endsWith('v1.html') ? body1 : body2 }),
  });
  assert.deepEqual(plan.summary, { contents: 1, expectedVersions: 2, ready: 1, existing: 1, conflicts: 0, failures: 0 });
  assert.equal(plan.ready[0].objectKey, 'contents/abc12345/v2.html');
  assert.equal(plan.ready[0].uploadedAt, content.updatedAt);
});

test('버전 backfill은 충돌·누락을 차단하고 ready만 조건부 생성한다', async () => {
  const conflictPlan = await planContentVersionBackfill({
    contents: [{ ...content, latestVersion: 1 }],
    listVersions: async () => [{ contentId: content.contentId, version: 1, objectKey: 'wrong', sizeBytes: 1, sha256: '0'.repeat(64) }],
    inspectObject: async () => ({ body: Buffer.from('one') }),
  });
  assert.equal(conflictPlan.summary.conflicts, 1);
  await assert.rejects(applyContentVersionBackfill(conflictPlan, { saveVersion: async () => true }), /중단/);

  const readyPlan = await planContentVersionBackfill({
    contents: [content], listVersions: async () => [], inspectObject: async () => ({ body: Buffer.from('ok') }),
  });
  const saved = [];
  assert.deepEqual(await applyContentVersionBackfill(readyPlan, { saveVersion: async (item) => { saved.push(item); return true; }, concurrency: 2 }), { created: 2, conflicts: 0 });
  assert.deepEqual(saved.map((item) => item.version).sort(), [1, 2]);
});

test('버전 backfill CLI는 기본 dry-run이고 apply 확인 문자열과 concurrency 범위를 강제한다', () => {
  assert.deepEqual(parseArgs([]), { apply: false, confirm: '', concurrency: 4, summaryOnly: false });
  assert.equal(parseArgs(['--apply', `--confirm=${CONFIRM}`, '--concurrency=8', '--summary-only']).apply, true);
  assert.throws(() => parseArgs(['--apply']), /confirm/);
  assert.throws(() => parseArgs(['--concurrency=9']), /1~8/);
});
