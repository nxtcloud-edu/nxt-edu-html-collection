const MIN_USAGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DELIVERY_DELAY_MS = 24 * 60 * 60 * 1000;

function parseTimestamp(value, name) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${name}은 ISO 날짜여야 합니다.`);
  return timestamp;
}

function validateObservationWindow({ from, to, loggingStart, now = Date.now() }) {
  const fromMs = parseTimestamp(from, 'from');
  const toMs = parseTimestamp(to, 'to');
  const loggingStartMs = parseTimestamp(loggingStart, 'logging-start');
  if (toMs <= fromMs) throw new Error('to는 from보다 뒤여야 합니다.');
  if (toMs - fromMs < MIN_USAGE_WINDOW_MS) throw new Error('사용량 관찰은 최소 7일이어야 합니다.');
  if (fromMs < loggingStartMs) throw new Error('from은 CloudFront 로그 활성화 시점보다 이를 수 없습니다.');
  if (toMs > now - DELIVERY_DELAY_MS) throw new Error('CloudFront 로그 전달 지연을 위해 to 이후 24시간이 지나야 합니다.');
  return { fromMs, toMs };
}

function parseCloudFrontLog(text, { fromMs, toMs }) {
  let fields = null;
  const requestsByKey = new Map();
  let recordsScanned = 0;
  let legacyRequests = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('#Fields:')) {
      fields = line.slice('#Fields:'.length).trim().split(/\s+/);
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!fields) throw new Error('CloudFront 로그의 #Fields 헤더가 없습니다.');
    const values = line.split('\t');
    const record = Object.fromEntries(fields.map((field, index) => [field, values[index]]));
    recordsScanned += 1;
    const timestamp = Date.parse(`${record.date}T${record.time}Z`);
    if (!Number.isFinite(timestamp) || timestamp < fromMs || timestamp >= toMs) continue;
    let path = record['cs-uri-stem'] || '';
    try { path = decodeURIComponent(path); } catch { /* 원문 경로로 판정 */ }
    if (!path.startsWith('/games/')) continue;
    const key = path.slice(1);
    requestsByKey.set(key, (requestsByKey.get(key) || 0) + 1);
    legacyRequests += 1;
  }
  return { recordsScanned, legacyRequests, requestsByKey };
}

function mergeUsage(results) {
  const requestsByKey = new Map();
  let recordsScanned = 0;
  let legacyRequests = 0;
  for (const result of results) {
    recordsScanned += result.recordsScanned;
    legacyRequests += result.legacyRequests;
    for (const [key, count] of result.requestsByKey) requestsByKey.set(key, (requestsByKey.get(key) || 0) + count);
  }
  return { recordsScanned, legacyRequests, requestsByKey };
}

function usageEvidence({ from, to, filesScanned, usage }) {
  return {
    complete: true,
    source: 'cloudfront-access-log',
    prefix: 'games/',
    observedFrom: new Date(from).toISOString(),
    observedTo: new Date(to).toISOString(),
    filesScanned,
    recordsScanned: usage.recordsScanned,
    legacyRequests: usage.legacyRequests,
    requestsByKey: Object.fromEntries([...usage.requestsByKey.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

module.exports = {
  DELIVERY_DELAY_MS,
  MIN_USAGE_WINDOW_MS,
  mergeUsage,
  parseCloudFrontLog,
  usageEvidence,
  validateObservationWindow,
};
