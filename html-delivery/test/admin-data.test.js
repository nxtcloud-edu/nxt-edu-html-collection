const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { filterAdminContents, validateAdminV2Patch } = require('../domain/admin-content');
const { paginateAdminContents } = require('../domain/admin-query');
const { createAuditRepository } = require('../repositories/audit-repository');
const { createVersionRepository, versionSortKey } = require('../repositories/version-repository');

async function tempDirectory() { return fs.mkdtemp(path.join(os.tmpdir(), 'nxt-admin-data-')); }

test('ContentVersion repository는 버전을 조건부 추가하고 공개·관리자 DTO를 분리한다', async () => {
  const directory = await tempDirectory();
  try {
    const repository = createVersionRepository({ localFile: path.join(directory, 'versions.json') });
    const record = {
      contentId: 'abc12345', version: 1, objectKey: 'contents/abc12345/v1.html', originalFileName: '작품.html',
      sizeBytes: 42, sha256: 'a'.repeat(64), uploadedAt: '2026-08-22T00:00:00.000Z',
    };
    assert.equal(await repository.save(record), true);
    assert.equal(await repository.save(record), false);
    const [stored] = await repository.list(record.contentId);
    assert.equal(stored.createdAt, versionSortKey(1));
    assert.equal(repository.publicVersion(stored, 1).objectKey, undefined);
    assert.equal(repository.publicVersion(stored, 1).sha256, undefined);
    assert.equal(repository.adminVersion(stored, 1).objectKey, record.objectKey);
    assert.equal(await repository.deleteForContent(record.contentId), 1);
    assert.deepEqual(await repository.list(record.contentId), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('AuditLog repository는 최신순 cursor와 필터를 제공하고 secret 필드를 만들지 않는다', async () => {
  const directory = await tempDirectory();
  let id = 0;
  try {
    const repository = createAuditRepository({ localFile: path.join(directory, 'audit.jsonl'), createId: () => `audit${++id}` });
    await repository.record({ actorId: 'admin.1', action: 'update-content-v2', targetType: 'content', targetId: '11111111', occurredAt: '2026-08-22T01:00:00.000Z' });
    await repository.record({ actorId: 'admin.2', action: 'update-cohort-v2', targetType: 'cohort', targetId: 'coh_aaaaaaaaaaaa', occurredAt: '2026-08-22T02:00:00.000Z' });
    await repository.record({ actorId: 'admin.1', action: 'export-cohort-v2', targetType: 'export', targetId: 'export1', occurredAt: '2026-08-22T03:00:00.000Z' });
    const first = await repository.list({ limit: 2 });
    assert.deepEqual(first.items.map((item) => item.action), ['export-cohort-v2', 'update-cohort-v2']);
    assert.ok(first.nextCursor);
    const second = await repository.list({ limit: 2, cursor: first.nextCursor });
    assert.deepEqual(second.items.map((item) => item.action), ['update-content-v2']);
    assert.deepEqual((await repository.list({ actorId: 'admin.1' })).items.map((item) => item.actorId), ['admin.1', 'admin.1']);
    assert.equal(JSON.stringify(first.items).includes('password'), false);
    assert.equal((await repository.list({ cursor: 'broken' })).status, 'invalid-cursor');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('관리자 콘텐츠 query는 ID 기반 필터·검색·안정 cursor를 적용한다', () => {
  const contents = [
    { contentId: '11111111', cohortId: 'coh_aaaaaaaaaaaa', title: '첫 작품', name: '가', affiliation: 'A', category: '미니게임', updatedAt: '2026-08-22T03:00:00.000Z' },
    { contentId: '22222222', cohortId: 'coh_aaaaaaaaaaaa', title: '둘째 웹', name: '나', affiliation: 'A', category: '웹페이지', updatedAt: '2026-08-22T02:00:00.000Z' },
    { contentId: '33333333', cohortId: 'coh_bbbbbbbbbbbb', title: '셋째', name: '다', affiliation: 'B', category: '웹페이지', updatedAt: '2026-08-22T01:00:00.000Z' },
  ];
  assert.deepEqual(filterAdminContents(contents, { cohortId: 'coh_aaaaaaaaaaaa', contentType: 'webpage', query: '둘째' }).map((item) => item.contentId), ['22222222']);
  const first = paginateAdminContents(contents, { pageSize: 2 });
  assert.deepEqual(first.items.map((item) => item.contentId), ['11111111', '22222222']);
  assert.equal(first.total, 3);
  const second = paginateAdminContents(contents, { pageSize: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.contentId), ['33333333']);
  assert.equal(paginateAdminContents(contents, { cursor: 'broken' }).status, 'invalid-cursor');
});

test('v2 관리자 수정 검증은 cohortId·owner kind·contentType을 레거시 저장 필드로 변환한다', () => {
  const existing = { cohortId: 'coh_aaaaaaaaaaaa', title: '기존', name: '1팀', category: '미니게임' };
  const cohorts = [{ cohortId: 'coh_aaaaaaaaaaaa', name: '팀 수업', submissionMode: 'team', teams: ['1팀', '2팀'] }];
  const result = validateAdminV2Patch(existing, { title: '새 제목', owner: { kind: 'team', name: '2팀' }, contentType: 'webpage' }, cohorts);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.fields, { title: '새 제목', name: '2팀', category: '웹페이지' });
  assert.match(validateAdminV2Patch(existing, { owner: { kind: 'individual', name: '2팀' } }, cohorts).errors[0], /소유자 유형/);
});
