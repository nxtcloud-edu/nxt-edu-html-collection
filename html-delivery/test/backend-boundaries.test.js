const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createObjectStorage } = require('../adapters/object-storage');
const { createFeedbackRepository } = require('../repositories/feedback-repository');
const { createCohortService } = require('../services/cohort-service');
const { createContentService } = require('../services/content-service');

async function tempDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'nxt-boundary-'));
}

test('object storage adapter는 로컬 HTML 저장·URL·삭제를 같은 계약으로 제공한다', async () => {
  const directory = await tempDirectory();
  try {
    const storage = createObjectStorage({ localDirectory: directory, localPort: 4321 });
    await storage.putHtml('contents/abc12345/v1.html', Buffer.from('<h1>ok</h1>'), { version: '1' });
    assert.equal(await fs.readFile(path.join(directory, 'contents/abc12345/v1.html'), 'utf8'), '<h1>ok</h1>');
    assert.equal(storage.publicUrl('contents/abc12345/v1.html'), 'http://localhost:4321/deployed/contents/abc12345/v1.html');
    await storage.deleteObject('contents/abc12345/v1.html');
    await assert.rejects(fs.access(path.join(directory, 'contents/abc12345/v1.html')),
      (error) => error.code === 'ENOENT');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('feedback repository는 로컬 fallback에서 저장·정렬·단건·콘텐츠 삭제를 캡슐화한다', async () => {
  const directory = await tempDirectory();
  try {
    const repository = createFeedbackRepository({ localFile: path.join(directory, 'feedback.jsonl') });
    const later = { contentKey: 'abc12345', createdAt: '2026-08-22T10:00:00.000Z', nickname: '둘', message: '나중' };
    const earlier = { contentKey: 'abc12345', createdAt: '2026-08-22T09:00:00.000Z', nickname: '하나', message: '먼저' };
    await repository.save(later);
    await repository.save(earlier);
    assert.deepEqual((await repository.list('abc12345')).map((item) => item.message), ['먼저', '나중']);
    assert.equal(await repository.deleteEntry('abc12345', earlier.createdAt), true);
    assert.equal(await repository.deleteForContent('abc12345'), 1);
    assert.deepEqual(await repository.list('abc12345'), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('content service는 신규 콘텐츠 저장 순서와 버전 키 계약을 조율한다', async () => {
  const calls = [];
  const records = new Map();
  const repository = {
    create: async (item) => { calls.push(['create', item.contentId]); records.set(item.contentId, item); },
    delete: async () => true,
    findByIdentity: async () => null,
    getPrivate: async (id) => records.get(id) || null,
    getPublic: async (id) => records.get(id) || null,
    incrementLikes: async () => 1,
    list: async () => [...records.values()],
    updateFields: async () => true,
    updatePassword: async () => true,
    updateVersion: async (id, fields) => { calls.push(['version', id, fields.latestVersion]); records.set(id, { ...records.get(id), ...fields }); },
  };
  const service = createContentService({
    contentRepository: repository,
    feedbackRepository: { deleteForContent: async () => 0 },
    objectStorage: { putHtml: async (key) => calls.push(['put', key]), deleteObject: async () => {} },
    createContentId: () => 'abc12345',
    createVersionKey: (id, version) => `contents/${id}/v${version}.html`,
    preferredContentKey: (item) => item.latestObjectKey,
    versionStorageFields: (_item, key) => ({ latestObjectKey: key }),
    hashPassword: () => ({ passwordHash: 'hash', salt: 'salt' }),
    verifyPassword: () => true,
    allVersionKeysForContent: () => [],
    now: () => '2026-08-22T10:00:00.000Z',
  });
  const created = await service.create({
    cohort: { cohortId: 'coh_aaaaaaaaaaaa', name: '코호트' },
    ownerName: '학생', title: '작품', category: '웹페이지', password: 'secret', file: { buffer: Buffer.from('html') },
  });
  assert.equal(created.latestObjectKey, 'contents/abc12345/v1.html');
  assert.deepEqual(calls.slice(0, 2), [['put', 'contents/abc12345/v1.html'], ['create', 'abc12345']]);
  const versioned = await service.addVersion({ contentId: 'abc12345', password: 'secret', title: '작품 2', file: { buffer: Buffer.from('html2') } });
  assert.equal(versioned.content.latestVersion, 2);
  assert.deepEqual(calls.slice(2), [['put', 'contents/abc12345/v2.html'], ['version', 'abc12345', 2]]);
});

test('cohort service는 기본·커스텀 목록과 이름 변경 시 콘텐츠 갱신을 조율한다', async () => {
  const updates = [];
  const service = createCohortService({
    baseCohorts: ['기본'],
    cohortDates: { 기본: '8.22' },
    teamCohorts: {},
    getCustomCohorts: async () => [{ cohortId: 'coh_aaaaaaaaaaaa', name: '커스텀' }],
    addCustomCohort: async () => {},
    renameCustomCohort: async () => true,
    deriveLegacyCohortId: () => 'coh_bbbbbbbbbbbb',
    newCohortId: () => 'coh_cccccccccccc',
    isCohortId: () => true,
    contentService: {
      list: async () => [{ contentId: 'abc12345', affiliation: '커스텀' }],
      updateFields: async (...args) => updates.push(args),
    },
  });
  assert.deepEqual((await service.list()).map((cohort) => cohort.name), ['기본', '커스텀']);
  assert.equal((await service.rename({ oldName: '커스텀', name: '변경' })).status, 'renamed');
  assert.deepEqual(updates, [['abc12345', { affiliation: '변경' }]]);
  assert.equal((await service.rename({ oldName: '기본', name: '변경' })).status, 'base-cohort');
});
