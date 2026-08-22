const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {
  LOCAL_EXPORT_JOBS,
  claimExportJob,
  completeExportJob,
  createExportJob,
  failExportJob,
  getExportJob,
  listExportJobs,
  publicExportJob,
  requeueExportJob,
} = require('../export-jobs');

test('내보내기 작업은 실패 상태를 보존하고 조건부 재시도 후 완료된다', async () => {
  const previousTable = process.env.FEEDBACK_TABLE;
  delete process.env.FEEDBACK_TABLE;
  await fs.rm(LOCAL_EXPORT_JOBS, { force: true });
  const exportId = 'a'.repeat(32);
  try {
    const created = await createExportJob({
      exportId,
      cohort: '2026-테스트',
      contentIds: ['1234abcd'],
      requestedAt: '2026-08-22T00:00:00.000Z',
      requestedBy: 'admin',
      appBaseUrl: 'http://localhost:3210',
    });
    assert.equal(created.status, 'queued');
    assert.equal(created.attempt, 0);
    assert.equal(await claimExportJob(exportId, '2026-08-22T00:00:01.000Z'), true);
    assert.equal(await claimExportJob(exportId, '2026-08-22T00:00:02.000Z'), false);
    await failExportJob(exportId, { failedAt: '2026-08-22T00:00:03.000Z', errorCode: 'EXPORT_FAILED' });
    assert.equal((await getExportJob(exportId)).status, 'failed');
    assert.equal(await requeueExportJob(exportId, '2026-08-22T00:00:04.000Z'), true);
    const retried = await getExportJob(exportId);
    assert.equal(retried.status, 'queued');
    assert.equal(retried.attempt, 1);
    assert.equal(Object.hasOwn(retried, 'failedAt'), false);
    assert.equal(Object.hasOwn(retried, 'startedAt'), false);
    assert.equal(await claimExportJob(exportId, '2026-08-22T00:00:05.000Z'), true);
    await completeExportJob(exportId, {
      completedAt: '2026-08-22T00:00:06.000Z',
      archiveExpiresAt: '2026-08-23T00:00:06.000Z',
      fileName: '2026-테스트_콘텐츠_2026-08-22.zip',
      count: 1,
      storageKey: null,
    });
    const completed = await getExportJob(exportId);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.attempt, 2);
    assert.equal((await listExportJobs())[0].exportId, exportId);
    const visible = publicExportJob(completed);
    assert.equal(Object.hasOwn(visible, 'contentIds'), false);
    assert.equal(Object.hasOwn(visible, 'appBaseUrl'), false);
  } finally {
    await fs.rm(LOCAL_EXPORT_JOBS, { force: true });
    if (previousTable === undefined) delete process.env.FEEDBACK_TABLE;
    else process.env.FEEDBACK_TABLE = previousTable;
  }
});
