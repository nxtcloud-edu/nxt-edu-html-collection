const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { applyObjectCopyPlan, buildObjectCopyPlan } = require('../migrations/content-object-copy');
const { APPLY_CONFIRMATION, parseArgs } = require('../scripts/copy-legacy-content-objects');

function record(contentId, latestVersion = 2) {
  return { contentId, latestVersion, latestKey: `games/${contentId}-v${latestVersion}.html` };
}

function fakeStore(entries) {
  const objects = new Map(Object.entries(entries).map(([key, value]) => [key, Buffer.from(value)]));
  const list = (prefix) => [...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, body]) => ({ key, sizeBytes: body.length }));
  const fingerprint = async (key) => {
    const body = objects.get(key);
    return body ? { sizeBytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') } : null;
  };
  const copyVersion = async ({ sourceKey, destinationKey }) => {
    if (objects.has(destinationKey)) throw new Error('overwrite attempted');
    objects.set(destinationKey, Buffer.from(objects.get(sourceKey)));
  };
  return { copyVersion, fingerprint, list, objects };
}

test('dry-run은 모든 레거시 버전의 pending 복사와 size·SHA-256 기준을 만든다', async () => {
  const store = fakeStore({
    'games/aaaaaaaa-v1.html': 'first',
    'games/aaaaaaaa-v2.html': 'second',
  });
  const plan = await buildObjectCopyPlan({
    contents: [record('aaaaaaaa')],
    sourceObjects: store.list('games/'),
    destinationObjects: store.list('contents/'),
    fingerprint: store.fingerprint,
  });
  assert.equal(plan.summary.ready, 1);
  assert.equal(plan.summary.pendingCopies, 2);
  assert.equal(plan.summary.totalBytesToCopy, 11);
  assert.equal(plan.contents[0].versions.every((version) => /^[0-9a-f]{64}$/.test(version.source.sha256)), true);
});

test('apply는 목적지를 덮어쓰지 않고 복사 후 재실행에서 전 버전을 verified로 판정한다', async () => {
  const store = fakeStore({
    'games/bbbbbbbb-v1.html': 'one',
    'games/bbbbbbbb-v2.html': 'two',
  });
  const initial = await buildObjectCopyPlan({ contents: [record('bbbbbbbb')], sourceObjects: store.list('games/'), destinationObjects: [], fingerprint: store.fingerprint });
  const applied = await applyObjectCopyPlan({ plan: initial, copyVersion: store.copyVersion });
  assert.deepEqual({ succeeded: applied.succeededContents, copied: applied.copiedObjects }, { succeeded: 1, copied: 2 });
  const rerun = await buildObjectCopyPlan({ contents: [record('bbbbbbbb')], sourceObjects: store.list('games/'), destinationObjects: store.list('contents/'), fingerprint: store.fingerprint });
  assert.equal(rerun.summary.verified, 1);
  assert.equal(rerun.summary.verifiedCopies, 2);
  assert.equal(rerun.summary.pendingCopies, 0);
});

test('누락·추가 원본과 기존 목적지 불일치는 해당 콘텐츠만 차단하고 orphan을 보고한다', async () => {
  const store = fakeStore({
    'games/cccccccc-v1.html': 'only-one',
    'games/cccccccc-v3.html': 'extra',
    'games/dddddddd-v1.html': 'source',
    'contents/dddddddd/v1.html': 'different',
    'games/eeeeeeee-v1.html': 'orphan',
  });
  const plan = await buildObjectCopyPlan({
    contents: [record('cccccccc'), record('dddddddd', 1)],
    sourceObjects: store.list('games/'),
    destinationObjects: store.list('contents/'),
    fingerprint: store.fingerprint,
  });
  assert.equal(plan.summary.blocked, 1);
  assert.equal(plan.summary.conflicts, 1);
  assert.equal(plan.summary.expectedVersions, 3);
  assert.deepEqual(plan.contents[0].missingSourceKeys, ['games/cccccccc-v2.html']);
  assert.deepEqual(plan.contents[0].extraSourceKeys, ['games/cccccccc-v3.html']);
  assert.deepEqual(plan.orphanSourceKeys.sort(), ['games/cccccccc-v3.html', 'games/eeeeeeee-v1.html']);
  const applied = await applyObjectCopyPlan({ plan, copyVersion: store.copyVersion });
  assert.equal(applied.attemptedContents, 0);
});

test('CLI는 기본 dry-run이고 apply에 확인 문자열과 제한된 concurrency를 요구한다', () => {
  assert.deepEqual(parseArgs([]), { apply: false, confirm: '', report: '', summaryOnly: false, concurrency: 6 });
  assert.throws(() => parseArgs(['--apply']), new RegExp(APPLY_CONFIRMATION));
  assert.equal(parseArgs(['--apply', `--confirm=${APPLY_CONFIRMATION}`, '--summary-only']).apply, true);
  assert.throws(() => parseArgs(['--concurrency=17']), /1~16/);
});
