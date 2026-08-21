const test = require('node:test');
const assert = require('node:assert/strict');
const { applyContentReadSwitchPlan, buildContentReadSwitchPlan } = require('../migrations/content-read-switch');
const { APPLY_CONFIRMATION, parseArgs } = require('../scripts/switch-content-read-pointers');

function content(contentId, fields = {}) {
  return { contentId, latestVersion: 2, latestKey: `games/${contentId}-v2.html`, ...fields };
}

function copyPlan(records) {
  return { contents: records.map((record) => ({ contentId: record.contentId, status: record.copyStatus || 'verified' })) };
}

test('검증된 레거시 콘텐츠만 additive latestObjectKey 전환 대상으로 계획한다', () => {
  const records = [content('aaaaaaaa'), content('bbbbbbbb', { copyStatus: 'blocked' })];
  const plan = buildContentReadSwitchPlan({ contents: records, copyPlan: copyPlan(records) });
  assert.deepEqual(plan.summary, { contents: 2, ready: 1, switched: 0, nativeV2: 0, blocked: 1, conflicts: 0 });
  assert.equal(plan.contents[0].latestObjectKey, 'contents/aaaaaaaa/v2.html');
});

test('기존 fallback은 보존하고 동일 포인터 재실행은 switched로 판정한다', async () => {
  const records = [content('cccccccc')];
  let stored = records[0];
  const initial = buildContentReadSwitchPlan({ contents: records, copyPlan: copyPlan(records) });
  const applied = await applyContentReadSwitchPlan({ plan: initial, updatePointer: async (fields) => {
    stored = { ...stored, latestObjectKey: fields.latestObjectKey };
    return true;
  } });
  assert.equal(applied.succeededContents, 1);
  assert.equal(stored.latestKey, 'games/cccccccc-v2.html');
  const rerun = buildContentReadSwitchPlan({ contents: [stored], copyPlan: copyPlan([stored]) });
  assert.equal(rerun.summary.switched, 1);
  assert.equal(rerun.summary.ready, 0);
});

test('예상 밖 포인터는 덮어쓰지 않고 conflict로 격리한다', async () => {
  const records = [content('dddddddd', { latestObjectKey: 'contents/dddddddd/v1.html' })];
  const plan = buildContentReadSwitchPlan({ contents: records, copyPlan: copyPlan(records) });
  assert.equal(plan.summary.conflicts, 1);
  const applied = await applyContentReadSwitchPlan({ plan, updatePointer: async () => true });
  assert.equal(applied.attemptedContents, 0);
});

test('CLI는 기본 dry-run이고 apply 확인 문자열을 강제한다', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.throws(() => parseArgs(['--apply']), new RegExp(APPLY_CONFIRMATION));
  assert.equal(parseArgs(['--apply', `--confirm=${APPLY_CONFIRMATION}`]).apply, true);
});
