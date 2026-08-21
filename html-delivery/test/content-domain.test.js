const test = require('node:test');
const assert = require('node:assert/strict');
const {
  categoryFromContentType,
  contentTypeFromCategory,
  normalizeLegacyCategory,
  toDomainContent,
  toLegacyContent,
} = require('../domain/content');

test('콘텐츠 유형은 레거시 한글 분류와 v2 저장값을 정규화한다', () => {
  assert.equal(contentTypeFromCategory('미니게임'), 'game');
  assert.equal(contentTypeFromCategory('game'), 'game');
  assert.equal(contentTypeFromCategory('웹페이지'), 'webpage');
  assert.equal(contentTypeFromCategory('랜딩페이지'), 'webpage');
  assert.equal(contentTypeFromCategory('webpage'), 'webpage');
  assert.equal(contentTypeFromCategory('기타'), null);
  assert.equal(categoryFromContentType('game'), '미니게임');
  assert.equal(categoryFromContentType('webpage'), '웹페이지');
  assert.equal(normalizeLegacyCategory('랜딩페이지'), '웹페이지');
});

test('레거시 저장 레코드는 운영 값을 바꾸지 않고 v2 Content로 변환된다', () => {
  const domain = toDomainContent({
    contentId: 'a1b2c3d4',
    affiliation: '2026-고대세종-ai',
    name: '홍길동',
    title: 'AI 여행 도우미',
    category: '랜딩페이지',
    latestVersion: 2,
    latestKey: 'games/a1b2c3d4-v2.html',
    likes: 3,
    createdAt2: '2026-07-01T01:00:00.000Z',
    updatedAt: '2026-07-02T01:00:00.000Z',
  });

  assert.deepEqual(domain, {
    contentId: 'a1b2c3d4',
    cohortId: null,
    owner: { kind: 'individual', name: '홍길동' },
    title: 'AI 여행 도우미',
    contentType: 'webpage',
    latestVersion: 2,
    latestObjectKey: 'games/a1b2c3d4-v2.html',
    likes: 3,
    createdAt: '2026-07-01T01:00:00.000Z',
    updatedAt: '2026-07-02T01:00:00.000Z',
  });
});

test('팀 코호트와 신규 필드는 v2 Content에서 명시적으로 보존된다', () => {
  const domain = toDomainContent({
    contentId: '11223344',
    cohortId: 'coh_01k3f6m8p2qa',
    name: '3팀',
    title: '팀 웹페이지',
    contentType: 'webpage',
    latestVersion: 1,
    latestObjectKey: 'contents/11223344/v1.html',
    likes: 0,
    createdAt2: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  }, { ownerKind: 'team' });

  assert.equal(domain.cohortId, 'coh_01k3f6m8p2qa');
  assert.deepEqual(domain.owner, { kind: 'team', name: '3팀' });
  assert.equal(domain.latestObjectKey, 'contents/11223344/v1.html');
});

test('지원하지 않는 분류는 조용히 기본값으로 바꾸지 않고 거부한다', () => {
  assert.throws(() => toDomainContent({
    contentId: 'a1b2c3d4',
    name: '홍길동',
    title: '기타 콘텐츠',
    category: '기타',
    latestVersion: 1,
    latestKey: 'games/a1b2c3d4-v1.html',
  }), /지원하지 않는 콘텐츠 분류/);
});

test('v2 Content는 기존 공개 API 필드로 역변환할 수 있다', () => {
  const legacy = toLegacyContent({
    contentId: 'a1b2c3d4',
    cohortId: 'coh_01k3f6m8p2qa',
    owner: { kind: 'individual', name: '홍길동' },
    title: 'AI 여행 도우미',
    contentType: 'game',
    latestVersion: 2,
    latestObjectKey: 'games/a1b2c3d4-v2.html',
    likes: 3,
    createdAt: '2026-07-01T01:00:00.000Z',
    updatedAt: '2026-07-02T01:00:00.000Z',
  }, { cohortName: '2026-고대세종-ai' });

  assert.deepEqual(legacy, {
    contentId: 'a1b2c3d4',
    cohortId: 'coh_01k3f6m8p2qa',
    name: '홍길동',
    title: 'AI 여행 도우미',
    affiliation: '2026-고대세종-ai',
    category: '미니게임',
    latestVersion: 2,
    latestKey: 'games/a1b2c3d4-v2.html',
    likes: 3,
    createdAt2: '2026-07-01T01:00:00.000Z',
    updatedAt: '2026-07-02T01:00:00.000Z',
  });
});
