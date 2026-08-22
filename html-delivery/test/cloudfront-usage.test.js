const test = require('node:test');
const assert = require('node:assert/strict');
const { DELIVERY_DELAY_MS, mergeUsage, parseCloudFrontLog, usageEvidence, validateObservationWindow } = require('../migrations/cloudfront-usage');
const { parseArgs } = require('../scripts/collect-legacy-usage');

const header = '#Version: 1.0\n#Fields: date time cs-method cs-uri-stem sc-status\n';

test('CloudFront 로그에서 관찰 구간의 games 요청만 집계한다', () => {
  const text = `${header}2026-08-23\t01:00:00\tGET\t/games/aaaaaaaa-v1.html\t200\n2026-08-23\t02:00:00\tGET\t/contents/aaaaaaaa/v1.html\t200\n2026-08-24\t01:00:00\tGET\t/games/aaaaaaaa-v1.html\t304\n`;
  const result = parseCloudFrontLog(text, { fromMs: Date.parse('2026-08-23T00:00:00Z'), toMs: Date.parse('2026-08-24T00:00:00Z') });
  assert.equal(result.recordsScanned, 3);
  assert.equal(result.legacyRequests, 1);
  assert.equal(result.requestsByKey.get('games/aaaaaaaa-v1.html'), 1);
});

test('여러 로그의 요청 수를 병합하고 감사 근거 형식으로 만든다', () => {
  const usage = mergeUsage([
    { recordsScanned: 2, legacyRequests: 1, requestsByKey: new Map([['games/a.html', 1]]) },
    { recordsScanned: 3, legacyRequests: 2, requestsByKey: new Map([['games/a.html', 1], ['games/b.html', 1]]) },
  ]);
  const evidence = usageEvidence({ from: Date.parse('2026-08-01T00:00:00Z'), to: Date.parse('2026-08-08T00:00:00Z'), filesScanned: 2, usage });
  assert.deepEqual(evidence.requestsByKey, { 'games/a.html': 2, 'games/b.html': 1 });
  assert.equal(evidence.legacyRequests, 3);
});

test('7일 관찰·로그 시작 이후·24시간 전달 지연을 강제한다', () => {
  const now = Date.parse('2026-08-10T00:00:00Z');
  assert.deepEqual(validateObservationWindow({ from: '2026-08-01T00:00:00Z', to: '2026-08-08T00:00:00Z', loggingStart: '2026-08-01T00:00:00Z', now }), {
    fromMs: Date.parse('2026-08-01T00:00:00Z'),
    toMs: Date.parse('2026-08-08T00:00:00Z'),
  });
  assert.throws(() => validateObservationWindow({ from: '2026-08-01T00:00:00Z', to: '2026-08-07T00:00:00Z', loggingStart: '2026-08-01T00:00:00Z', now }), /최소 7일/);
  assert.throws(() => validateObservationWindow({ from: '2026-08-01T00:00:00Z', to: new Date(now - DELIVERY_DELAY_MS + 1).toISOString(), loggingStart: '2026-08-01T00:00:00Z', now }), /24시간/);
});

test('사용량 수집 CLI는 관찰 경계를 모두 요구한다', () => {
  assert.throws(() => parseArgs([]), /--from/);
  assert.deepEqual(parseArgs(['--from=2026-08-01', '--to=2026-08-08', '--logging-start=2026-08-01', '--report=/tmp/usage.json']), {
    from: '2026-08-01', to: '2026-08-08', loggingStart: '2026-08-01', report: '/tmp/usage.json',
  });
});
