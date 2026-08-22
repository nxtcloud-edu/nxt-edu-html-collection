const test = require('node:test');
const assert = require('node:assert/strict');
const { paginatePublicContents } = require('../domain/public-query');

const contents = Array.from({ length: 5 }, (_, index) => ({
  contentId: `a${String(index + 1).padStart(7, '0')}`,
  updatedAt: `2026-08-22T00:00:0${5 - index}.000Z`,
  likes: 5 - index,
}));

test('공개 콘텐츠 pagination은 필터 범위가 묶인 cursor로 다음 페이지를 제공한다', () => {
  const filters = { sort: 'latest', cohortId: 'coh_aaaaaaaaaaaa', type: 'webpage', query: 'ai' };
  const first = paginatePublicContents(contents, filters, { pageSize: 2 });
  assert.equal(first.status, 'ok');
  assert.equal(first.total, 5);
  assert.deepEqual(first.items.map((item) => item.contentId), ['a0000001', 'a0000002']);
  const second = paginatePublicContents(contents, filters, { pageSize: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.contentId), ['a0000003', 'a0000004']);
});

test('공개 콘텐츠 cursor는 정렬·필터 변경과 정렬 키 변경을 거부한다', () => {
  const filters = { sort: 'latest', cohortId: '', type: '', query: '' };
  const first = paginatePublicContents(contents, filters, { pageSize: 2 });
  assert.equal(paginatePublicContents(contents, { ...filters, sort: 'likes' }, { pageSize: 2, cursor: first.nextCursor }).status, 'invalid-cursor');
  const changed = contents.map((item) => item.contentId === 'a0000002' ? { ...item, updatedAt: '2026-08-23T00:00:00.000Z' } : item);
  assert.equal(paginatePublicContents(changed, filters, { pageSize: 2, cursor: first.nextCursor }).status, 'invalid-cursor');
});
