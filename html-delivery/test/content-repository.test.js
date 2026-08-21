const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTENT_REPOSITORY_METHODS, createContentRepository } = require('../repositories/content-repository');

test('콘텐츠 repository는 필요한 메서드가 빠진 구현을 거부한다', () => {
  assert.throws(() => createContentRepository({}), /content repository 메서드가 없습니다: list/);
});

test('콘텐츠 repository는 저장 구현을 고정된 계약으로 위임한다', async () => {
  const calls = [];
  const implementation = Object.fromEntries(CONTENT_REPOSITORY_METHODS.map((method) => [method, async (...args) => {
    calls.push({ method, args });
    return method;
  }]));
  const repository = createContentRepository(implementation);

  assert.equal(Object.isFrozen(repository), true);
  assert.equal(await repository.getPublic('a1b2c3d4'), 'getPublic');
  assert.deepEqual(calls, [{ method: 'getPublic', args: ['a1b2c3d4'] }]);
});
