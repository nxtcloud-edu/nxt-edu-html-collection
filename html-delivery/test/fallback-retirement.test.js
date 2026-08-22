const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFallbackRetirementPlan, buildFallbackRetirementPlan } = require('../migrations/fallback-retirement');
const { APPLY_CONFIRMATION, parseArgs } = require('../scripts/retire-legacy-fallbacks');

function content(contentId, fields = {}) {
  return { contentId, latestVersion: 2, latestKey: `games/${contentId}-v2.html`, latestObjectKey: `contents/${contentId}/v2.html`, ...fields };
}

function copyPlan(records) {
  return { contents: records.map((record) => ({ contentId: record.contentId, status: record.copyStatus || 'verified' })) };
}

function evidence(requestsByKey = {}) {
  return {
    complete: true,
    source: 'cloudfront-access-log',
    prefix: 'games/',
    observedFrom: '2026-08-01T00:00:00.000Z',
    observedTo: '2026-08-08T00:00:00.000Z',
    requestsByKey,
  };
}

test('완전한 7일 근거와 검증 복사본이 있는 fallback만 은퇴 준비한다', () => {
  const records = [content('aaaaaaaa')];
  const plan = buildFallbackRetirementPlan({ contents: records, copyPlan: copyPlan(records), usageEvidence: evidence() });
  assert.equal(plan.summary.ready, 1);
  assert.equal(plan.contents[0].expectedLegacyKey, 'games/aaaaaaaa-v2.html');
  assert.equal(plan.contents[0].expectedV2Key, 'contents/aaaaaaaa/v2.html');
});

test('사용량 근거 없음·관찰 요청·복사 미검증은 각각 차단한다', () => {
  const missing = content('bbbbbbbb');
  const used = content('cccccccc');
  const unverified = content('dddddddd', { copyStatus: 'blocked' });
  const missingPlan = buildFallbackRetirementPlan({ contents: [missing], copyPlan: copyPlan([missing]) });
  const usedPlan = buildFallbackRetirementPlan({ contents: [used], copyPlan: copyPlan([used]), usageEvidence: evidence({ 'games/cccccccc-v1.html': 1 }) });
  const blockedPlan = buildFallbackRetirementPlan({ contents: [unverified], copyPlan: copyPlan([unverified]), usageEvidence: evidence() });
  assert.equal(missingPlan.summary.awaitingUsageEvidence, 1);
  assert.equal(usedPlan.summary.observedUsage, 1);
  assert.equal(blockedPlan.summary.blocked, 1);
});

test('예상 밖 포인터는 충돌로 격리하고 이미 은퇴한 레코드는 재실행 가능하다', () => {
  const conflict = content('eeeeeeee', { latestObjectKey: 'contents/eeeeeeee/v1.html' });
  const retired = content('ffffffff', { latestKey: 'contents/ffffffff/v2.html', latestObjectKey: undefined });
  const plan = buildFallbackRetirementPlan({ contents: [conflict, retired], copyPlan: copyPlan([conflict, retired]), usageEvidence: evidence() });
  assert.equal(plan.summary.conflicts, 1);
  assert.equal(plan.summary.retired, 1);
});

test('apply는 ready만 조건부 갱신하고 실패를 보존한다', async () => {
  const records = [content('11111111'), content('22222222')];
  const plan = buildFallbackRetirementPlan({ contents: records, copyPlan: copyPlan(records), usageEvidence: evidence() });
  const applied = await applyFallbackRetirementPlan({ plan, retireFallback: async ({ contentId }) => contentId === '11111111' });
  assert.equal(applied.attemptedContents, 2);
  assert.equal(applied.succeededContents, 1);
  assert.equal(applied.failedContents, 1);
});

test('CLI apply는 명시적 확인 문자열과 사용량 보고서를 모두 요구한다', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.throws(() => parseArgs(['--apply']), new RegExp(APPLY_CONFIRMATION));
  assert.throws(() => parseArgs(['--apply', `--confirm=${APPLY_CONFIRMATION}`]), /usage-report/);
  assert.equal(parseArgs(['--apply', `--confirm=${APPLY_CONFIRMATION}`, '--usage-report=/tmp/usage.json']).apply, true);
  assert.throws(() => parseArgs(['--concurrency=17']), /1~16/);
});
