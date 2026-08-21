const test = require('node:test');
const assert = require('node:assert/strict');

const {
  allVersionKeysForContent,
  contentReadKeys,
  createLegacyVersionKey,
  createV2VersionKey,
  createVersionKey,
  isValidContentKey,
  preferredContentKey,
  storageSchemeForKey,
  versionKeysForContent,
} = require('../domain/content-storage');

test('신규 콘텐츠는 contents 키를 쓰고 기존 콘텐츠는 최초 prefix를 유지한다', () => {
  const contentId = '1234abcd';
  assert.equal(createVersionKey(contentId, 1), `contents/${contentId}/v1.html`);
  assert.equal(createVersionKey(contentId, 2, { existingKey: `games/${contentId}-v1.html` }), `games/${contentId}-v2.html`);
  assert.equal(createVersionKey(contentId, 2, { existingKey: `contents/${contentId}/v1.html` }), `contents/${contentId}/v2.html`);
  assert.throws(() => createVersionKey(contentId, 2, { existingKey: 'unknown/key.html' }), /unsupported content key/);
});

test('두 저장 키 계약을 검증하고 관리자 삭제 대상은 같은 prefix에서만 만든다', () => {
  const contentId = '1234abcd';
  assert.equal(createLegacyVersionKey(contentId, 3), `games/${contentId}-v3.html`);
  assert.equal(createV2VersionKey(contentId, 3), `contents/${contentId}/v3.html`);
  assert.equal(isValidContentKey(`games/${contentId}-v12.html`), true);
  assert.equal(isValidContentKey(`contents/${contentId}/v12.html`), true);
  assert.equal(isValidContentKey(`contents/${contentId}-v12.html`), false);
  assert.equal(storageSchemeForKey(`games/${contentId}-v1.html`), 'legacy-games');
  assert.equal(storageSchemeForKey(`contents/${contentId}/v1.html`), 'v2-contents');
  assert.deepEqual(versionKeysForContent({ contentId, latestVersion: 3, latestKey: `games/${contentId}-v3.html` }), [
    `games/${contentId}-v1.html`,
    `games/${contentId}-v2.html`,
    `games/${contentId}-v3.html`,
  ]);
  assert.deepEqual(versionKeysForContent({ contentId, latestVersion: 2, latestKey: `contents/${contentId}/v2.html` }), [
    `contents/${contentId}/v1.html`,
    `contents/${contentId}/v2.html`,
  ]);
});

test('새 포인터를 우선하고 레거시 fallback과 양쪽 삭제 대상을 보존한다', () => {
  const contentId = '1234abcd';
  const switched = {
    contentId,
    latestVersion: 3,
    latestObjectKey: `contents/${contentId}/v3.html`,
    latestKey: `games/${contentId}-v2.html`,
  };
  assert.deepEqual(contentReadKeys(switched), [switched.latestObjectKey, switched.latestKey]);
  assert.equal(preferredContentKey(switched), switched.latestObjectKey);
  assert.deepEqual(versionKeysForContent(switched), [
    `contents/${contentId}/v1.html`,
    `contents/${contentId}/v2.html`,
    `contents/${contentId}/v3.html`,
  ]);
  assert.deepEqual(allVersionKeysForContent(switched), [
    `contents/${contentId}/v1.html`,
    `contents/${contentId}/v2.html`,
    `contents/${contentId}/v3.html`,
    `games/${contentId}-v1.html`,
    `games/${contentId}-v2.html`,
  ]);
});
