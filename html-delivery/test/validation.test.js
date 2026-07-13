const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { hashPassword, mergeVersionFields, newContentId, publicContent, verifyPassword } = require('../registry');
const { CATEGORIES, COHORTS, TEAM_COHORTS, buildPublicUrl, cohortOptions, createVersionKey, filterGames, isValidContentId, isValidContentKey, normalizeCategory, parseFeedbackLog, requestBaseUrl, sortGames, validateFeedbackInput, validateUploadInput } = require('../server');

const htmlFile = { originalname: 'content.html', size: 100 };
function runtimeSecret() { return crypto.randomBytes(12).toString('base64url'); }

test('업로드 입력은 소유 비밀번호 4~30자를 요구한다', () => {
  const password = runtimeSecret();
  assert.deepEqual(validateUploadInput({ affiliation: COHORTS[0], category: CATEGORIES[0], name: '작품', password, file: htmlFile }).errors, []);
  assert.equal(validateUploadInput({ affiliation: COHORTS[0], category: CATEGORIES[0], name: '작품', password: '', file: htmlFile }).errors[0], '비밀번호는 4~30자로 입력하세요.');
  assert.equal(validateUploadInput({ affiliation: COHORTS[0], category: CATEGORIES[0], name: '작품', password: 'x'.repeat(31), file: htmlFile }).errors[0], '비밀번호는 4~30자로 입력하세요.');
});

test('기존 업로드 검증 규칙을 유지한다', () => {
  const password = runtimeSecret();
  assert.equal(validateUploadInput({ affiliation: '없음', category: CATEGORIES[0], name: '작품', password, file: htmlFile }).errors[0], '등록된 수업(코호트)을 선택하세요.');
  assert.equal(validateUploadInput({ affiliation: COHORTS[0], category: '', name: '작품', password, file: htmlFile }).errors[0], '분류를 선택하세요.');
  assert.equal(validateUploadInput({ affiliation: COHORTS[0], category: CATEGORIES[0], name: '', password, file: htmlFile }).errors[0], '이름은 1~40자로 입력하세요.');
  assert.equal(validateUploadInput({ affiliation: COHORTS[0], category: CATEGORIES[0], name: '작품', password, file: { originalname: 'x.txt', size: 1 } }).errors[0], 'HTML 파일만 업로드할 수 있습니다.');
});

test('기업인턴십 코호트는 1팀부터 8팀만 허용한다', () => {
  const affiliation = '2026-고대세종-기업인턴십';
  const password = runtimeSecret();
  assert.deepEqual(TEAM_COHORTS[affiliation], ['1팀', '2팀', '3팀', '4팀', '5팀', '6팀', '7팀', '8팀']);
  assert.deepEqual(validateUploadInput({ affiliation, category: CATEGORIES[0], name: '3팀', password, file: htmlFile }).errors, []);
  assert.equal(validateUploadInput({ affiliation, category: CATEGORIES[0], name: '홍길동', password, file: htmlFile }).errors[0], '팀을 선택하세요.');
  assert.deepEqual(validateUploadInput({ affiliation: COHORTS[0], category: CATEGORIES[0], name: '홍길동', password, file: htmlFile }).errors, []);
});

test('코호트 API 계약은 일반 수업과 팀 수업을 함께 표현한다', () => {
  assert.deepEqual(cohortOptions(), [
    { name: '2026-고대세종-ai', teams: null },
    { name: '2026-한이음-ai-중급', teams: null },
    { name: '2026-고대세종-기업인턴십', teams: ['1팀', '2팀', '3팀', '4팀', '5팀', '6팀', '7팀', '8팀'] },
  ]);
});

test('레거시 랜딩페이지 분류를 웹페이지로 정규화한다', () => {
  assert.deepEqual(CATEGORIES, ['미니게임', '웹페이지']);
  assert.equal(normalizeCategory('랜딩페이지'), '웹페이지');
  assert.equal(normalizeCategory('웹페이지'), '웹페이지');
  const legacy = [{ contentId: '11111111', category: normalizeCategory('랜딩페이지') }];
  assert.equal(filterGames(legacy, { category: '웹페이지' }).length, 1);
});

test('scrypt 해시는 랜덤 salt를 사용하고 timing-safe 검증한다', () => {
  const password = runtimeSecret();
  const first = hashPassword(password);
  const second = hashPassword(password);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.equal(verifyPassword(password, first.passwordHash, first.salt), true);
  assert.equal(verifyPassword(runtimeSecret(), first.passwordHash, first.salt), false);
});

test('공개 콘텐츠에서 해시와 salt 및 Dynamo 키를 제거한다', () => {
  const content = publicContent({ contentKey: 'content#12345678', createdAt: 'meta', contentId: '12345678', passwordHash: 'hash', salt: 'salt', name: '작품' });
  assert.deepEqual(content, { contentId: '12345678', name: '작품' });
});

test('버전 부분 갱신은 추천 수와 소유권 필드를 보존한다', () => {
  const previous = { contentId: '12345678', likes: 7, passwordHash: 'hash', salt: 'salt', latestVersion: 1, latestKey: 'games/12345678-v1.html', updatedAt: 'old' };
  const updated = mergeVersionFields(previous, { latestVersion: 2, latestKey: 'games/12345678-v2.html', updatedAt: 'new' });
  assert.deepEqual(updated, { ...previous, latestVersion: 2, latestKey: 'games/12345678-v2.html', updatedAt: 'new' });
});

test('contentId와 버전 key 계약을 지킨다', () => {
  const id = newContentId();
  assert.equal(isValidContentId(id), true);
  assert.equal(createVersionKey(id, 1), `games/${id}-v1.html`);
  assert.equal(isValidContentKey(`games/${id}-v12.html`), true);
  assert.equal(isValidContentKey(`games/${id}.html`), false);
  assert.equal(isValidContentKey('games/20260712000000-abcd.html'), false);
});

test('S3 콘텐츠 URL은 별도 HTTPS REST 오리진을 사용한다', () => {
  const key = 'games/12345678-v2.html';
  assert.equal(buildPublicUrl(key, { bucket: 'gallery', region: 'ap-northeast-2' }), 'https://gallery.s3.ap-northeast-2.amazonaws.com/games/12345678-v2.html');
  assert.equal(buildPublicUrl(key, { port: 3210 }), 'http://localhost:3210/deployed/games/12345678-v2.html');
});

test('발급 URL은 APP_BASE_URL을 요청 헤더보다 우선한다', () => {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'https://showcase.nxtcloud.kr';
  try {
    const req = { protocol: 'http', get: (name) => (name === 'host' ? 'lambda-url.example' : undefined) };
    assert.equal(requestBaseUrl(req), 'https://showcase.nxtcloud.kr');
  } finally {
    if (previous === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previous;
  }
});

test('갤러리는 필터와 최신순 정렬을 적용한다', () => {
  const games = [
    { contentId: '11111111', affiliation: COHORTS[0], category: CATEGORIES[0], updatedAt: '2026-01-01T00:00:00Z', likes: 1 },
    { contentId: '22222222', affiliation: COHORTS[1], category: CATEGORIES[1], updatedAt: '2026-01-02T00:00:00Z', likes: 3 },
  ];
  assert.deepEqual(filterGames(games, { cohort: COHORTS[0] }).map((x) => x.contentId), ['11111111']);
  assert.deepEqual(sortGames(games).map((x) => x.contentId), ['22222222', '11111111']);
});

test('갤러리는 추천순에서 추천 수와 최신 업데이트를 차례로 비교한다', () => {
  const games = [
    { contentId: '11111111', updatedAt: '2026-01-01T00:00:00Z', likes: 2 },
    { contentId: '22222222', updatedAt: '2026-01-03T00:00:00Z', likes: 5 },
    { contentId: '33333333', updatedAt: '2026-01-02T00:00:00Z', likes: 5 },
  ];
  assert.deepEqual(sortGames(games, 'likes').map((x) => x.contentId), ['22222222', '33333333', '11111111']);
});

test('피드백 검증과 contentId별 오름차순 파싱을 유지한다', () => {
  assert.equal(validateFeedbackInput({ message: ' ' }).errors[0], '피드백은 1~500자로 입력하세요.');
  const id = '12345678';
  const lines = [
    JSON.stringify({ contentKey: id, createdAt: '2026-01-02T00:00:00Z', message: '둘' }),
    JSON.stringify({ contentKey: id, createdAt: '2026-01-01T00:00:00Z', message: '하나' }),
  ].join('\n');
  assert.deepEqual(parseFeedbackLog(lines, id).map((x) => x.message), ['하나', '둘']);
});
