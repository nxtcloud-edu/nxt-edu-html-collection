const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COHORT_ID_PATTERN,
  applyCohortIdBackfill,
  deriveLegacyCohortId,
  newCohortId,
  planCohortIdBackfill,
} = require('../migrations/cohort-id-backfill');
const { CONFIRMATION, parseArgs } = require('../scripts/backfill-cohort-ids');

test('레거시 코호트 ID는 이름에 대해 결정적이고 신규 ID는 계약 형식을 따른다', () => {
  const first = deriveLegacyCohortId('2026-고대세종-ai');
  assert.equal(first, deriveLegacyCohortId('2026-고대세종-ai'));
  assert.notEqual(first, deriveLegacyCohortId('2026-한이음-ai-중급'));
  assert.match(first, COHORT_ID_PATTERN);
  assert.match(newCohortId(), COHORT_ID_PATTERN);
});

test('dry-run은 누락 ID만 계획하고 기존 일치 값은 보존하며 충돌과 미등록 이름을 unresolved로 남긴다', () => {
  const knownId = deriveLegacyCohortId('기본 코호트');
  const customId = deriveLegacyCohortId('커스텀 코호트');
  const plan = planCohortIdBackfill({
    baseCohorts: [{ cohortId: knownId, name: '기본 코호트' }],
    customCohorts: [{ name: '커스텀 코호트', date: '8.21' }],
    contents: [
      { contentId: '11111111', affiliation: '기본 코호트' },
      { contentId: '22222222', affiliation: '커스텀 코호트', cohortId: customId },
      { contentId: '33333333', affiliation: '기본 코호트', cohortId: deriveLegacyCohortId('다른 코호트') },
      { contentId: '44444444', affiliation: '없는 코호트' },
    ],
  });

  assert.deepEqual(plan.summary, {
    cohortsTotal: 2,
    cohortsToUpdate: 1,
    contentsTotal: 4,
    contentsToUpdate: 1,
    unchanged: 1,
    unresolved: 2,
    conflicts: 1,
  });
  assert.equal(plan.customCohorts[0].cohortId, customId);
  assert.deepEqual(plan.contentUpdates, [{ contentId: '11111111', affiliation: '기본 코호트', cohortId: knownId }]);
  assert.deepEqual(plan.unresolved.map((item) => item.reason), ['cohort-id-conflict', 'cohort-not-found']);
  assert.equal(JSON.stringify(plan).includes('passwordHash'), false);
});

test('중복 코호트 이름이나 ID는 내용을 임의 매핑하지 않고 unresolved로 보고한다', () => {
  const duplicateId = deriveLegacyCohortId('중복 ID');
  const plan = planCohortIdBackfill({
    baseCohorts: [
      { cohortId: duplicateId, name: '같은 이름' },
      { cohortId: deriveLegacyCohortId('다른 ID'), name: '같은 이름' },
      { cohortId: duplicateId, name: '다른 이름' },
    ],
    customCohorts: [],
    contents: [{ contentId: '11111111', affiliation: '같은 이름' }],
  });

  assert.equal(plan.summary.unresolved > 0, true);
  assert.equal(plan.contentUpdates.length, 0);
  assert.equal(plan.unresolved.some((item) => item.reason === 'duplicate-cohort-name'), true);
  assert.equal(plan.unresolved.some((item) => item.reason === 'duplicate-cohort-id'), true);
});

test('apply는 unresolved가 있으면 쓰지 않고, 깨끗한 계획은 누락 필드만 재실행 가능하게 기록한다', async () => {
  const writes = [];
  const blocked = planCohortIdBackfill({
    baseCohorts: [],
    customCohorts: [],
    contents: [{ contentId: '11111111', affiliation: '없는 코호트' }],
  });
  await assert.rejects(
    applyCohortIdBackfill(blocked, {
      saveCustomCohorts: async () => writes.push('cohorts'),
      setContentCohortId: async () => writes.push('content'),
    }),
    /unresolved/,
  );
  assert.deepEqual(writes, []);

  const clean = planCohortIdBackfill({
    baseCohorts: [],
    customCohorts: [{ name: '커스텀 코호트' }],
    contents: [
      { contentId: '11111111', affiliation: '커스텀 코호트' },
      { contentId: '22222222', affiliation: '커스텀 코호트', cohortId: deriveLegacyCohortId('커스텀 코호트') },
    ],
  });
  const result = await applyCohortIdBackfill(clean, {
    saveCustomCohorts: async (cohorts) => writes.push(['cohorts', cohorts]),
    setContentCohortId: async (update) => writes.push(['content', update]),
  });

  assert.deepEqual(result, { cohortsUpdated: 1, contentsUpdated: 1 });
  assert.equal(writes.length, 2);
  assert.equal(writes[1][1].contentId, '11111111');
});

test('CLI는 기본 dry-run이고 apply에는 명시적 확인 문자열이 필요하다', () => {
  assert.deepEqual(parseArgs([]), { apply: false, summaryOnly: false });
  assert.throws(() => parseArgs(['--apply']), new RegExp(CONFIRMATION));
  assert.deepEqual(parseArgs(['--apply', `--confirm=${CONFIRMATION}`, '--summary-only']), { apply: true, summaryOnly: true });
});

test('apply는 dry-run 이후 코호트 목록이 바뀌면 조건부 쓰기 충돌로 중단한다', async () => {
  const plan = planCohortIdBackfill({
    baseCohorts: [],
    customCohorts: [{ name: '커스텀 코호트' }],
    contents: [],
  });
  await assert.rejects(
    applyCohortIdBackfill(plan, {
      saveCustomCohorts: async () => false,
      setContentCohortId: async () => true,
    }),
    /write conflict: custom cohorts/,
  );
});
